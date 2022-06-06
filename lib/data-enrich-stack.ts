import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';
import * as lambda from "aws-cdk-lib/aws-lambda";
import { S3EventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { PythonFunction } from "@aws-cdk/aws-lambda-python-alpha";
import { ISecurityGroup, IVpc, SelectedSubnets } from "aws-cdk-lib/aws-ec2";

export interface DataEnrichStackProps {
    readonly project_name: string,
    readonly vpc: IVpc,
    readonly appSubnetSecurityGroup: ISecurityGroup,
    readonly s3Bucket: s3.IBucket,
    readonly sqsForS3Notification: boolean,
}

export class DataEnrichStack extends Construct {
  constructor(scope: Construct, id: string, props: DataEnrichStackProps) {
    super(scope, id);
    
    const sqsForS3Notification = true;

    /**
     * Create a SQS queue to receive raw data from the S3 bucket
     */
    const queue_raw_data = new sqs.Queue(this, "QueueS3RawData", {
      visibilityTimeout: cdk.Duration.seconds(300)
    });


    /**
     * Create the policy for lambda
     */
     const lambdaPolicyStatement = new iam.PolicyStatement({
        actions: [
            "s3:Get*",
            "s3:List*",
            "s3:Put*",
            "secretsmanager:GetSecretValue",
            "sqs:*",
  
        ],
        effect: iam.Effect.ALLOW,
        resources: ["*"]
      })

    // Added by JM - Enable SQS for S3 or not
    let pluginDataResolverIndex = 'lambda_raw_data_transform.py';
    let loadLogfileToBqIndex = 'lambda_load_logfile_to_bq.py';

    if (props.sqsForS3Notification) {
      pluginDataResolverIndex = 'lambda_raw_data_transform_sqs.py';
      loadLogfileToBqIndex = 'lambda_load_logfile_to_bq_sqs.py';
    }
    
    const pluginDataResolver = new PythonFunction(
        this,
        "PluginDataResolver",
        {
          entry: "src/lambda/",
          index: pluginDataResolverIndex, //Added by JM - ORG: index: "plugin_data_resolver.py",
          handler: "lambda_handler",
          runtime: lambda.Runtime.PYTHON_3_9,
          memorySize: 2048,
          environment: {
            REGION_NAME: cdk.Aws.REGION,
            S3_BUCKET_NAME: props.s3Bucket.bucketName,
            DEFAULT_TABLENAME: 'lambda-target-real-2',
            S3_NEW_FILE_PREFIX: 'processed-nginx-logs/', //Added by JM
          },
          timeout: cdk.Duration.seconds(300),
          //role: props.role,
          vpc: props.vpc,
          vpcSubnets: props.vpc.selectSubnets({subnetType: ec2.SubnetType.PRIVATE_WITH_NAT}),
          securityGroups: [props.appSubnetSecurityGroup],
        }
    );
    pluginDataResolver.addToRolePolicy(lambdaPolicyStatement);
    
    if (props.sqsForS3Notification) {
      pluginDataResolver.addEventSource(new SqsEventSource(queue_raw_data, {}));
      props.s3Bucket.addEventNotification(s3.EventType.OBJECT_CREATED, new s3n.SqsDestination(queue_raw_data), {prefix: 'fluentbit-s3-data'});
    } else {

      props.s3Bucket.addEventNotification(s3.EventType.OBJECT_CREATED, 
        new s3n.LambdaDestination(pluginDataResolver), 
        // { prefix: props.project_name+'-kinesis-data' }
        { prefix: 'fluentbit-s3-data' } // FluentBit+S3 bucket prefix
      );
      // pluginDataResolver.addEventSource(new S3EventSource(
      //     props.s3Bucket,
      //     {
      //         events: [s3.EventType.OBJECT_CREATED],
      //         filters: [{ prefix: props.project_name+'-kinesis-data' }]
      //     }
      // ));
    }

    //ADDED by JM
    /**
     * Create a SQS queue to receive processed data from the S3 bucket
     */
    const queue_processed_data = new sqs.Queue(this, "QueueS3ProcessedData", {
      visibilityTimeout: cdk.Duration.seconds(300)
    });
  
    /**
     * Create a Lambda Function to load processed files to BigQuery
     */
    const loadLogfileToBq = new PythonFunction(
      this,
      "LoadLogfileToBq",
      {
        entry: "src/lambda/",
        index: loadLogfileToBqIndex,
        handler: "lambda_handler",
        runtime: lambda.Runtime.PYTHON_3_9,
        memorySize: 256,
        environment: {
          REGION: cdk.Aws.REGION,
          S3_BUCKET_NAME: props.s3Bucket.bucketName,
          S3_NEW_FILE_PREFIX: 'processed-nginx-logs/',
          DEFAULT_TABLENAME: 'lambda-target-real-2',
          BQ_PROJECT: 'us-jm-project-1.data_ingestion_test_1',
          BQ_DATASET: 'data_ingestion_test_1',
        },
        timeout: cdk.Duration.seconds(90),
        //role: props.role,
        vpc: props.vpc,
        vpcSubnets: props.vpc.selectSubnets({subnetType: ec2.SubnetType.PRIVATE_WITH_NAT}),
        securityGroups: [props.appSubnetSecurityGroup],
      }
    );
    loadLogfileToBq.addToRolePolicy(lambdaPolicyStatement);
    
    if (props.sqsForS3Notification) {
      loadLogfileToBq.addEventSource(new SqsEventSource(queue_processed_data, {}));
      props.s3Bucket.addEventNotification(s3.EventType.OBJECT_CREATED, new s3n.SqsDestination(queue_processed_data), {prefix: 'processed-nginx-logs'});
    } else {
  
      props.s3Bucket.addEventNotification(s3.EventType.OBJECT_CREATED, 
        new s3n.LambdaDestination(loadLogfileToBq), 
        // { prefix: props.project_name+'-kinesis-data' }
        { prefix: 'processed-nginx-logs' } // FluentBit+S3 bucket prefix
      );
    }

  }
}