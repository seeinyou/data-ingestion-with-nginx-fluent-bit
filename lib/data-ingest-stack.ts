import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam'
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as efs from 'aws-cdk-lib/aws-efs';
import * as s3_assets from 'aws-cdk-lib/aws-s3-assets'
import * as path from 'path';
import { Construct } from 'constructs';
import * as msk from '@aws-cdk/aws-msk-alpha';
import * as kinesis from 'aws-cdk-lib/aws-kinesis';
import * as firehose from '@aws-cdk/aws-kinesisfirehose-alpha';
import * as destinations from '@aws-cdk/aws-kinesisfirehose-destinations-alpha';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudformation from 'aws-cdk-lib/aws-cloudformation';

import autoscaling = require('aws-cdk-lib/aws-autoscaling');
import elbv2 = require('aws-cdk-lib/aws-elasticloadbalancingv2');
import { Vpc } from "aws-cdk-lib/aws-ec2";
// import { KeyPair } from 'cdk-ec2-key-pair';


export interface DataIngestStackProps {
    readonly cidr: string,
    readonly nginx_http_port: number,
    readonly project_name: string,
    readonly fluentbit_log_level: string,
    readonly asg_min_capacity: number,
    readonly asg_max_capacity: number,
    readonly asg_desired_capacity: number,
    readonly certificate_arn: string,
    readonly ingestion_output_target_s3: boolean,
    readonly ingestion_output_target_kinesis_stream: boolean,
    readonly ingestion_output_target_msk: boolean,
    readonly kafka_connect_key_id: string,
    readonly kafka_connect_secret: string
}

export class DataIngestStack extends Construct {
  public readonly clientVpc: ec2.Vpc;
  public readonly appSubnetSecurityGroup: ec2.SecurityGroup;
  public readonly s3Bucket: s3.IBucket;
  constructor(scope: Construct, id: string, props: DataIngestStackProps) {
    super(scope, id);

    const MACRO_FLUENTBIT_OUTPUT_AWS_REGION = cdk.Stack.of(this).region;
    const MACRO_FLUENTBIT_OUTPUT_KINESIS_STREAM = props.project_name+'-stream';
    const MACRO_NGINX_HTTP_PORT: number = props.nginx_http_port;
    const MACRO_FLUENTBIT_LOG_LEVEL = props.fluentbit_log_level;
    
    const MACRO_FLUENTBIT_OUTPUT_KAFKA = props.project_name+'-topic';
    var MACRO_KAFKA_BROKERS = 'MACRO_KAFKA_BROKERS';
    var MACRO_FLUENTBIT_OUTPUT_CONFIG = '';

    const asg_min_capacity = props.asg_min_capacity;
    const asg_max_capacity = props.asg_max_capacity;
    const asg_desired_capacity = props.asg_desired_capacity;

    const td_agent_bit_conf_asset = new s3_assets.Asset(this, 'td_agent_bit_conf_asset', { path: path.join(__dirname, '../src/td-agent-bit.conf') });
    const nginx_conf_asset = new s3_assets.Asset(this, 'nginx_conf_asset', { path: path.join(__dirname, '../src/nginx.conf') });
    const nginx_logrotate_conf_asset = new s3_assets.Asset(this, 'nginx_logrotate_conf_asset', { path: path.join(__dirname, '../src/nginx-logrotate.conf') });
    const mkc_plugin_py_asset = new s3_assets.Asset(this, 'mkc_plugin_conf_asset', { path: path.join(__dirname, '../src/mkc-plugin.py') });
    

    // Create a Key Pair to be used with this EC2 Instance
    // Temporarily disabled since `cdk-ec2-key-pair` is not yet CDK v2 compatible
    // const key = new KeyPair(this, 'KeyPair', {
    //   name: 'cdk-keypair',
    //   description: 'Key Pair created with CDK Deployment',
    // });
    // key.grantReadOnPublicKey

    // Create new VPC with 4 Subnets
    this.clientVpc = new ec2.Vpc(this, props.project_name+'-VPC', {
      maxAzs: 2,
      cidr: props.cidr,
      enableDnsSupport: true,
      natGateways: 2,
      subnetConfiguration: 
      [{
        cidrMask: 24,
        name: props.project_name+"-subnet-public",
        subnetType: ec2.SubnetType.PUBLIC
      },
      {
        cidrMask: 24,
        name: props.project_name+"-subnet-private",
        subnetType: ec2.SubnetType.PRIVATE_WITH_NAT
      }],
      // gatewayEndpoints: {
      //   S3: {
      //     service: ec2.GatewayVpcEndpointAwsService.S3,
      //     subnets: [{
      //       subnetType: ec2.SubnetType.PRIVATE_WITH_NAT
      //     }]
      //   }
      // }
    });
    this.clientVpc.addGatewayEndpoint('S3VPCEndpoint', {
      service: ec2.GatewayVpcEndpointAwsService.S3,
      subnets: [
        {
          subnetType: ec2.SubnetType.PRIVATE_WITH_NAT
        }
      ]
    });
    this.clientVpc.addInterfaceEndpoint('KinesisStreamVPCEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.KINESIS_STREAMS,
      subnets: {subnetType: ec2.SubnetType.PRIVATE_WITH_NAT}
    });
    this.clientVpc.addFlowLog('FlowLogS3', {
      destination: ec2.FlowLogDestination.toS3()
    });

    // const now = new Date();
    this.s3Bucket = new s3.Bucket(this, props.project_name+ '-s3bucket', {
          bucketName: props.project_name + '-' + MACRO_FLUENTBIT_OUTPUT_AWS_REGION,
          removalPolicy: cdk.RemovalPolicy.RETAIN,
          accessControl: s3.BucketAccessControl.BUCKET_OWNER_FULL_CONTROL,
          encryption: s3.BucketEncryption.S3_MANAGED,
          blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
          versioned: true,
    });

    // const cfnStack = new cloudformation.CfnStack(this, 'MyCfnStack', {
    //   templateUrl: 'templateUrl',
    //   // the properties below are optional
    //   // notificationArns: ['notificationArns'],
    //   parameters: {
    //     parametersKey: 'parameters',
    //   },
    //   tags: [{
    //     key: 'key',
    //     value: 'value',
    //   }],
    //   timeoutInMinutes: 30,
    // });

    const role = new iam.Role(this, props.project_name + '-Ec2Role', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com')
    })

    role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'));
    role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonS3FullAccess'));
    role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonKinesisFullAccess'));
    role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonMSKFullAccess'));
    role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchFullAccess'));

    const mskConnectStatement = {
      "Effect": "Allow",
      "Action": "kafkaconnect:*",
      "Resource": "*"
    }
    role.addToPolicy(iam.PolicyStatement.fromJson(mskConnectStatement));
    const ec2Statement = {
      "Effect": "Allow",
      "Action": "ec2:*",
      "Resource": "*"
    }
    role.addToPolicy(iam.PolicyStatement.fromJson(ec2Statement));
    

    td_agent_bit_conf_asset.grantRead(role);
    nginx_conf_asset.grantRead(role);
    nginx_logrotate_conf_asset.grantRead(role);

    const mkcRole = new iam.Role(this, props.project_name + "-MkcRole", {
      roleName: props.project_name + "-MkcRole-"+MACRO_FLUENTBIT_OUTPUT_AWS_REGION,
      assumedBy: new iam.ServicePrincipal('kafkaconnect.amazonaws.com')
    })
    const s3BucketStatement1 = {
      "Effect":"Allow",
      "Action":[
          "s3:ListAllMyBuckets"
          ],
      "Resource":"arn:aws:s3:::*"
    }
    const s3BucketStatement2 = {
      "Effect":"Allow",
      "Action":[
          "s3:ListBucket",
          "s3:GetBucketLocation"
          ],
      "Resource":"arn:aws:s3:::"+this.s3Bucket.bucketName
    }
    const s3BucketStatement3 = {
      "Effect":"Allow",
      "Action":[
          "s3:PutObject",
          "s3:GetObject",
          "s3:AbortMultipartUpload",
          "s3:ListMultipartUploadParts",
          "s3:ListBucketMultipartUploads"
          ],
      "Resource":"*"
    }
    mkcRole.addToPolicy(iam.PolicyStatement.fromJson(s3BucketStatement1));
    mkcRole.addToPolicy(iam.PolicyStatement.fromJson(s3BucketStatement2));
    mkcRole.addToPolicy(iam.PolicyStatement.fromJson(s3BucketStatement3));
    mkcRole.addToPolicy(iam.PolicyStatement.fromJson(mskConnectStatement));

    const mkcRoleStatement = {
        "Action": [
            "iam:PassRole"
        ],
        "Resource": [
          mkcRole.roleArn
        ],
        "Effect": "Allow"
    }
    role.addToPolicy(iam.PolicyStatement.fromJson(mkcRoleStatement));

    // Create an EFS drive
    const fileSystem = new efs.FileSystem(this, 'EfsForEC2', {
      vpc: this.clientVpc,
      performanceMode: efs.PerformanceMode.GENERAL_PURPOSE
    });

    const base_arch = 'aarch64';
    const cpuType = ec2.AmazonLinuxCpuType.ARM_64;

    // Use Latest Amazon Linux Image - CPU Type ARM64
    const ami = new ec2.AmazonLinuxImage({
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
        cpuType: cpuType
    });

    if (props.ingestion_output_target_msk) {
      /**
       * Create a MSK Cluster
       */
      const mskSG = new ec2.SecurityGroup(this, 'mskecurityGroup', {
        securityGroupName: 'mskSecurityGroup',
        description: 'security group for msk',
        vpc: this.clientVpc,
        allowAllOutbound: true
      });
      mskSG.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(9092), 'Allow Broker Access');
      mskSG.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(2181), 'Allow Zookeeper plaintext Access');
      mskSG.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(2182), 'Allow Zookeeper tls Access');
      
      const mskCluster = new msk.Cluster(this, 'Cluster', {
        clusterName: props.project_name+'-cluster',
        kafkaVersion: msk.KafkaVersion.V2_8_1,
        vpc: this.clientVpc,
        vpcSubnets: {
          subnetType: ec2.SubnetType.PRIVATE_WITH_NAT
        },
        numberOfBrokerNodes: 1,//numberOfBrokerNodes per az
        encryptionInTransit: {
          // clientBroker: msk.ClientBrokerEncryption.TLS,
          clientBroker: msk.ClientBrokerEncryption.PLAINTEXT,
        },
        securityGroups: [mskSG],
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      });

      MACRO_KAFKA_BROKERS = mskCluster.bootstrapBrokers;
      MACRO_FLUENTBIT_OUTPUT_CONFIG = 
        MACRO_FLUENTBIT_OUTPUT_CONFIG +
        " s/#kafka//g; ";

      // Create the instance using the Security Group, AMI, and KeyPair defined in the VPC created
      const ec2Instance = new ec2.Instance(this, 'KafkaClient', {
        vpc: this.clientVpc,
        instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MICRO),
        machineImage: ami,
        securityGroup: mskSG,
        // keyName: key.keyPairName,
        role: role
      });

      ec2Instance.addUserData(
        'sudo -u ec2-user -i',
        'sudo yum install -y java-1.8.0',
        'sudo yum install -y wget',
        'wget https://archive.apache.org/dist/kafka/2.6.2/kafka_2.12-2.6.2.tgz',
        'tar -xzf kafka_2.12-2.6.2.tgz',
        'kafka_2.12-2.6.2/bin/kafka-topics.sh --create --zookeeper '+mskCluster.zookeeperConnectionString+' --replication-factor 2 --partitions 2 --topic '+MACRO_FLUENTBIT_OUTPUT_KAFKA,
        'mkdir kafka-connect-s3 && cd kafka-connect-s3',
        'wget https://github.com/lensesio/stream-reactor/releases/download/2.1.3/kafka-connect-aws-s3-2.1.3.1-2.5.0-all.jar',
        'aws s3 cp kafka-connect-aws-s3-2.1.3.1-2.5.0-all.jar s3://'+this.s3Bucket.bucketName+'/kafka-connect-s3/',
        'sudo pip3 install boto3',
        'aws s3 cp '+mkc_plugin_py_asset.s3ObjectUrl+' /tmp/mkc-plugin.py',
        'sed "s/MACRO_FLUENTBIT_OUTPUT_AWS_REGION/'+MACRO_FLUENTBIT_OUTPUT_AWS_REGION
            +'/g; s/MACRO_S3_BUCKET_ARN/'+this.s3Bucket.bucketArn
            +'/g; s/MACRO_S3_BUCKET_NAME/'+this.s3Bucket.bucketName
            +'/g; s/MACRO_KAFKA_TOPIC/'+MACRO_FLUENTBIT_OUTPUT_KAFKA
            +'/g; s/MACRO_AWS_ACCESS_KEY_ID/'+props.kafka_connect_key_id
            +'/g; s/MACRO_KAFKA_BOOTSTRAP_SERVERS/'+mskCluster.bootstrapBrokers
            +'/g; s/MACRO_KAFKA_SECURITY_GROUP_ID/'+mskSG.securityGroupId
            +'/g; s/MACRO_KAFKA_SUBNET_ID_1/'+this.clientVpc.privateSubnets[0].subnetId
            +'/g; s/MACRO_KAFKA_SUBNET_ID_2/'+this.clientVpc.privateSubnets[1].subnetId
            +'/g" /tmp/mkc-plugin.py > ./mkc-plugin.py',
        'chmod +x ./mkc-plugin.py',
        'python3 mkc-plugin.py '+props.kafka_connect_secret +' '+ mkcRole.roleArn,
      );
    }
    if (props.ingestion_output_target_kinesis_stream) {
      /**
       * Create a new Kinesis Stream for FluentBit to output to
       */
      const sourceStream = new kinesis.Stream(this, 'SourceStream', {
          streamName: props.project_name + '-stream',
          streamMode: cdk.aws_kinesis.StreamMode.ON_DEMAND,
          retentionPeriod: cdk.Duration.hours(24),
      });

      const kinesisFirehoseRole = new iam.Role(this, props.project_name + "-kinesisFirehoseRole", {
        roleName: props.project_name + "-kinesisFirehoseRole-"+MACRO_FLUENTBIT_OUTPUT_AWS_REGION,
        assumedBy: new iam.ServicePrincipal('firehose.amazonaws.com')
      })

      kinesisFirehoseRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonS3FullAccess'));
      kinesisFirehoseRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonKinesisFullAccess'));
      
      const s3Prefix = props.project_name + '-kinesis-data';
      const deliveryStream = new firehose.DeliveryStream(this, props.project_name + '-delivery-stream', {
          sourceStream: sourceStream,
          destinations: [new destinations.S3Bucket(this.s3Bucket, {
              dataOutputPrefix: s3Prefix+'/year=!{timestamp:yyyy}/month=!{timestamp:MM}/day=!{timestamp:dd}/hour=!{timestamp:HH}/rand=!{firehose:random-string}',
              errorOutputPrefix: props.project_name + '-failures/!{firehose:error-output-type}/!{timestamp:yyyy}-!{timestamp:MM}-!{timestamp:dd}',
              // compression: destinations.Compression.GZIP,
              bufferingInterval: cdk.Duration.minutes(1),
              bufferingSize: cdk.Size.mebibytes(10),
          })],
      });

      // Alarm that triggers when the per-second average of incoming bytes exceeds 90% of the current service limit
      const incomingBytesPercentOfLimit = new cloudwatch.MathExpression({
        expression: 'incomingBytes / 300 / bytePerSecLimit',
        usingMetrics: {
          incomingBytes: deliveryStream.metricIncomingBytes({ statistic: cloudwatch.Statistic.SUM }),
          bytePerSecLimit: deliveryStream.metric('BytesPerSecondLimit'),
        },
      });

      new cloudwatch.Alarm(this, props.project_name + '-alarm', {
        metric: incomingBytesPercentOfLimit,
        threshold: 0.9,
        evaluationPeriods: 3,
      });

      MACRO_FLUENTBIT_OUTPUT_CONFIG = 
        MACRO_FLUENTBIT_OUTPUT_CONFIG +
        " s/#kinesis_streams//g; ";
    }
    if (props.ingestion_output_target_s3) {
      MACRO_FLUENTBIT_OUTPUT_CONFIG = 
        MACRO_FLUENTBIT_OUTPUT_CONFIG +
        " s/#s3//g; ";
    }

    // Allow SSH (TCP Port 22) access from anywhere
    // const securityGroup = new ec2.SecurityGroup(this, 'publicSubnetSecurityGroup', {
    //     securityGroupName: 'publicSubnetSecurityGroup',
    //     description: 'security group for public subnets',
    //     vpc: this.clientVpc,
    //     allowAllOutbound: true
    // });
    // securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22), 'Allow SSH Access')

    /**
       * Create security group for private subnets
       * The typical use case is the database querying by lambda functions. All lambda
       * functions are associated with the private subnet security group.
       */
    this.appSubnetSecurityGroup = new ec2.SecurityGroup(
      this,
      'appSubnetSecurityGroup',
      {
            securityGroupName: 'appSubnetSecurityGroup',
            description: 'security group for private subnets',
            vpc: this.clientVpc,
            allowAllOutbound: true,
            disableInlineRules: true
    });

    const userData = ec2.UserData.forLinux();
    userData.addCommands(
        "yum check-update -y",
        "yum update -y",
        'sudo echo "net.core.somaxconn = 32768" >> /etc/sysctl.conf',
        'sudo echo "net.ipv4.tcp_max_syn_backlog = 32768" >> /etc/sysctl.conf',
        'sudo echo "net.ipv4.ip_local_port_range = 1024 65535" >> /etc/sysctl.conf',
        'sudo sysctl -p',

        'sudo yum install docker -y',
        'sudo systemctl start docker',
        'sudo docker pull public.ecr.aws/aws-observability/aws-for-fluent-bit:stable',
        'sudo docker run --name=aws-fluent-bit -itd public.ecr.aws/aws-observability/aws-for-fluent-bit:stable',
        'sudo docker cp `docker ps -lq`:/fluent-bit /',
        'sudo docker stop `docker ps -lq`',
        'sudo docker rm `docker ps -lq`',

        'sudo yum install -y jq',
        
        "yum install -y amazon-efs-utils",                // Ubuntu: apt-get -y install amazon-efs-utils
        "yum install -y nfs-utils",
        "file_system_id_1=" + fileSystem.fileSystemId,
        "efs_mount_point_1=/mnt/efs/fs1",
        "mkdir -p \"${efs_mount_point_1}\"",
        "test -f \"/sbin/mount.efs\" && echo \"${file_system_id_1}:/ ${efs_mount_point_1} efs defaults,_netdev\" >> /etc/fstab || " +
        "echo \"${file_system_id_1}.efs." + MACRO_FLUENTBIT_OUTPUT_AWS_REGION + ".amazonaws.com:/ ${efs_mount_point_1} nfs4 nfsvers=4.1,rsize=1048576,wsize=1048576,hard,timeo=600,retrans=2,noresvport,_netdev 0 0\" >> /etc/fstab",
        "mount -a -t efs,nfs4 defaults",

        'aws s3 cp '+td_agent_bit_conf_asset.s3ObjectUrl+' /tmp/td-agent-bit.conf',
        'sed "s/MACRO_FLUENTBIT_LOG_LEVEL/'+MACRO_FLUENTBIT_LOG_LEVEL
          +'/g; s/MACRO_FLUENTBIT_OUTPUT_AWS_REGION/'+MACRO_FLUENTBIT_OUTPUT_AWS_REGION
          +'/g; s/MACRO_FLUENTBIT_OUTPUT_KINESIS_STREAM/'+MACRO_FLUENTBIT_OUTPUT_KINESIS_STREAM
          +'/g; s/MACRO_KAFKA_BROKERS/'+MACRO_KAFKA_BROKERS
          +'/g; s/MACRO_FLUENTBIT_OUTPUT_KAFKA/'+MACRO_FLUENTBIT_OUTPUT_KAFKA
          +'/g; s/MACRO_FLUENTBIT_OUTPUT_S3/'+this.s3Bucket.bucketName
          +'/g; '+MACRO_FLUENTBIT_OUTPUT_CONFIG
          +'" /tmp/td-agent-bit.conf > /fluent-bit/etc/fluent-bit.conf',
        
        'sudo mkdir -p /var/log/fluentbit/',
        'sudo amazon-linux-extras install nginx1 -y',

        'aws s3 cp '+nginx_conf_asset.s3ObjectUrl+' /tmp/nginx.conf',
        'sed "s/MACRO_NGINX_HTTP_PORT/'+MACRO_NGINX_HTTP_PORT+'/g" /tmp/nginx.conf > /etc/nginx/nginx.conf',

        'sudo rm /etc/logrotate.d/nginx',

        'aws s3 cp '+nginx_logrotate_conf_asset.s3ObjectUrl+' /etc/logrotate.d/nginx-logrotate.conf',

        'sudo echo "# Run nginx logrotate once a minute." >> /etc/cron.d/nginx-logrotate-crond.conf',
        'sudo echo "*/1 * * * * root /usr/sbin/logrotate /etc/logrotate.d/nginx-logrotate.conf" >> /etc/cron.d/nginx-logrotate-crond.conf',
        
        'sudo echo "/fluent-bit/bin/fluent-bit -e /fluent-bit/firehose.so -e /fluent-bit/cloudwatch.so -e /fluent-bit/kinesis.so -c /fluent-bit/etc/fluent-bit.conf" >> /etc/rc.local',
        'sudo chmod +x /etc/rc.d/rc.local',
        
        'sudo systemctl enable nginx',
        'sudo systemctl start nginx',
        'sudo echo "systemctl start nginx..."',
        'sudo echo $?',
        'sudo /fluent-bit/bin/fluent-bit -e /fluent-bit/firehose.so -e /fluent-bit/cloudwatch.so -e /fluent-bit/kinesis.so -c /fluent-bit/etc/fluent-bit.conf', 
    );
 
    //  define EBS for EC2 instances - 50GB are recommended
    const blockDeviceVolume = autoscaling.BlockDeviceVolume.ebs(50, { encrypted: true, volumeType: autoscaling.EbsDeviceVolumeType.GP3});
    const blockDevice: autoscaling.BlockDevice = {
      deviceName: '',
      volume: blockDeviceVolume,
    };

    const updatePolicy = autoscaling.UpdatePolicy.replacingUpdate();
    
    const healthCheck = autoscaling.HealthCheck.elb(/* all optional props */ {
      grace: cdk.Duration.minutes(180),
    });
    const asg = new autoscaling.AutoScalingGroup(this, 'ASG', {
        vpc: this.clientVpc,
        instanceType: ec2.InstanceType.of(ec2.InstanceClass.COMPUTE6_GRAVITON2, ec2.InstanceSize.MEDIUM),
        blockDevices: [ blockDevice ],
        machineImage: ami,
        securityGroup: this.appSubnetSecurityGroup,
        minCapacity: asg_min_capacity,
        maxCapacity: asg_max_capacity,
        desiredCapacity: asg_desired_capacity,
        vpcSubnets: {
            subnetType: ec2.SubnetType.PRIVATE_WITH_NAT
        },
        healthCheck: healthCheck,
        // keyName: key.keyPairName,
        role: role,
        updatePolicy: updatePolicy,
        userData: userData
    });
    //  Allow EC2 instances to access EFS
    fileSystem.connections.allowDefaultPortFrom(asg);
  
    userData.addSignalOnExitCommand(asg);
    
    const lbSecurityGroup = new ec2.SecurityGroup(this, 'LBSecurityGroup', {
        vpc: this.clientVpc,
        allowAllOutbound: true,
        securityGroupName: 'lbSecurityGroup',
        description: 'lbSecurityGroup',
    });
    lbSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(MACRO_NGINX_HTTP_PORT));
    lbSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443));
    const lb = new elbv2.ApplicationLoadBalancer(this, props.project_name+'-LB', {
        vpc: this.clientVpc,
        internetFacing: true,
        loadBalancerName: props.project_name+'-LB',
        securityGroup: lbSecurityGroup,
    });
    lb.connections.allowFromAnyIpv4(ec2.Port.tcp(MACRO_NGINX_HTTP_PORT), 'Allow inbound HTTP');
  
    if (props.certificate_arn != null && props.certificate_arn != '') {
      // Create HTTPS listener
      const httpsListener = lb.addListener('HTTPSListener', {
          protocol: elbv2.ApplicationProtocol.HTTPS,
          port: 443,
      });
      httpsListener.addCertificates('Certificate', [elbv2.ListenerCertificate.fromArn(props.certificate_arn)]);
      httpsListener.addTargets('Target', {
        protocol: elbv2.ApplicationProtocol.HTTP,
        port: MACRO_NGINX_HTTP_PORT,
        targets: [asg],
        healthCheck: {
          enabled: true,
          protocol: elbv2.Protocol.HTTP,
          port: MACRO_NGINX_HTTP_PORT.toString(),
          path: '/health',
          interval: cdk.Duration.seconds(10),
          timeout: cdk.Duration.seconds(6),
          healthyThresholdCount: 3
        }
      });
    }else{
      // Create HTTP listener
      const listener = lb.addListener('Listener', {
          protocol: elbv2.ApplicationProtocol.HTTP,
          port: MACRO_NGINX_HTTP_PORT,
      });
    
      listener.addTargets('Target', {
          protocol: elbv2.ApplicationProtocol.HTTP,
          port: MACRO_NGINX_HTTP_PORT,
          targets: [asg],
          healthCheck: {
            enabled: true,
            protocol: elbv2.Protocol.HTTP,
            port: MACRO_NGINX_HTTP_PORT.toString(),
            path: '/health',
            interval: cdk.Duration.seconds(10),
            timeout: cdk.Duration.seconds(6),
            healthyThresholdCount: 3
          }
      });
      listener.connections.allowDefaultPortFromAnyIpv4('Open to the world');
    }
    
    const targetTrackingScalingPolicy = new autoscaling.TargetTrackingScalingPolicy(this, 'MyTargetTrackingScalingPolicy', {
        autoScalingGroup: asg,
        targetValue: 60,
      
        // the properties below are optional
        cooldown: cdk.Duration.minutes(240),
        disableScaleIn: false,
        estimatedInstanceWarmup: cdk.Duration.minutes(30),
        predefinedMetric: autoscaling.PredefinedMetric.ASG_AVERAGE_CPU_UTILIZATION,
    });

    // Create outputs for connecting
    new cdk.CfnOutput(this, 'Load balancer Address', { value: lb.loadBalancerDnsName });
    new cdk.CfnOutput(this, 'td_agent_bit_conf_asset.s3ObjectUrl', { value: td_agent_bit_conf_asset.s3ObjectUrl })
  }
}