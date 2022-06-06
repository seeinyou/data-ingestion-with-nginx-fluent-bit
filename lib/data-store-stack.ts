import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as kinesis from 'aws-cdk-lib/aws-kinesis';
import * as firehose from '@aws-cdk/aws-kinesisfirehose-alpha';
import * as destinations from '@aws-cdk/aws-kinesisfirehose-destinations-alpha';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as glue from '@aws-cdk/aws-glue-alpha';
import * as athena from 'aws-cdk-lib/aws-athena';
import { Construct } from 'constructs';
import * as lakeformation from 'aws-cdk-lib/aws-lakeformation';
import { Effect } from 'aws-cdk-lib/aws-iam';
import { SecretValue } from 'aws-cdk-lib';

export interface DataStoreStackProps {
    readonly project_name: string
}

export class DataStoreStack extends Construct {
  constructor(scope: Construct, id: string, props: DataStoreStackProps) {
    super(scope, id);

    

    // const lfRoleName = props.project_name + '-lakeFormationRole';
    // const lakeFormationRole = new iam.Role(this, props.project_name + '-lakeFormationRole', {
    //   roleName: lfRoleName,
    //   assumedBy: new iam.ServicePrincipal('lakeformation.amazonaws.com')
    // })
    // lakeFormationRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AWSLakeFormationDataAdmin'));
    // lakeFormationRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonAthenaFullAccess'))
    // lakeFormationRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonS3FullAccess'));

    // // const statement1 = {
    // //   "Effect":"Allow",
    // //   "Principal":{
    // //     "Service":[
    // //       "glue.amazonaws.com",
    // //       "lakeformation.amazonaws.com",
    // //       "firehose.amazonaws.com"
    // //     ]
    // //   },
    // //   "Action":"sts:AssumeRole"
    // // }
    // // lakeFormationRole.addToPrincipalPolicy(iam.PolicyStatement.fromJson(statement1));

    // const s3BucketStatement = {
    //   "Effect": "Allow",
    //   "Action": [
    //     "s3:List*",
    //     "s3:Get*",
    //     "s3:Put*",
    //     "s3:Delete*"
    //   ],
    //   "Resource": [
    //     "arn:aws:s3:::"+s3bucket.bucketName,
    //     "arn:aws:s3:::"+s3bucket.bucketName+"/*"
    //   ]
    // }
    // lakeFormationRole.addToPolicy(iam.PolicyStatement.fromJson(s3BucketStatement));

    // const statement3 = {
    //   "Effect":"Allow",
    //   "Action":[
    //     "lakeformation:GetDataAccess",
    //     "lakeformation:GrantPermissions"
    //   ],
    //   "Resource":"*"
    // }
    // lakeFormationRole.addToPolicy(iam.PolicyStatement.fromJson(statement3));

    // const statement4 = {
    //   "Effect":"Allow",
    //   "Action":[
    //     "iam:PassRole"
    //   ],
    //   "Resource":[
    //     "arn:aws:iam::*:role/"+lfRoleName,
    //   ]
    // }
    // lakeFormationRole.addToPolicy(iam.PolicyStatement.fromJson(statement4));

    // const cfnResource = new lakeformation.CfnResource(this, 'MyCfnResource', {
    //   resourceArn: s3bucket.bucketArn,
    //   useServiceLinkedRole: false,
    //   // the properties below are optional
    //   roleArn: lakeFormationRole.roleArn,
    // });

    // const lakeFormationUser = new iam.User(this, 'LakeFormationUser', {
    //   userName: props.project_name+'-admin',
    //   password: SecretValue.plainText('Qwer6991!'),
    //   managedPolicies: [
    //     iam.ManagedPolicy.fromAwsManagedPolicyName('AWSLakeFormationDataAdmin'),
    //     iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonAthenaFullAccess'),
    //     iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonS3FullAccess'),
    //     iam.ManagedPolicy.fromAwsManagedPolicyName('AWSLakeFormationCrossAccountManager'),
    //     iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEC2ReadOnlyAccess')
    //   ]
    // });
    // const statement5 = {
    //   "Effect":"Allow",
    //   "Action": [
    //       "lakeformation:*",
    //       "cloudtrail:DescribeTrails",
    //       "cloudtrail:LookupEvents",
    //       "glue:GetDatabase",
    //       "glue:CreateDatabase",
    //       "glue:UpdateDatabase",
    //       "glue:DeleteDatabase",
    //       "glue:SearchTables",
    //       "glue:CreateTable",
    //       "glue:UpdateTable",
    //       "glue:DeleteTable",
    //       "glue:Get*",
    //       "glue:List*",
    //       "glue:BatchGetWorkflows",
    //       "glue:DeleteWorkflow",
    //       "glue:GetWorkflowRuns",
    //       "glue:StartWorkflowRun",
    //       "glue:GetWorkflow",
    //       "s3:ListBucket",
    //       "s3:GetBucketLocation",
    //       "s3:ListAllMyBuckets",
    //       "s3:GetBucketAcl",
    //       "iam:ListUsers",
    //       "iam:ListRoles",
    //       "iam:GetRole",
    //       "iam:GetRolePolicy",
    //       "cloudformation:*",
    //       "elasticmapreduce:*",
    //       "tag:Get*",
    //       "glue:BatchGetCrawlers",
    //       "ec2:AuthorizeSecurityGroupEgress",
    //       "ec2:AuthorizeSecurityGroupIngress",
    //       "ec2:RevokeSecurityGroupEgress",
    //       "ec2:RevokeSecurityGroupIngress"
    //   ],
    //   "Resource": "*"
    // }
    // lakeFormationUser.addToPolicy(iam.PolicyStatement.fromJson(statement5));

    // const statement6 = {
    //   "Effect":"Allow",
    //   "Action":"iam:PassRole",
    //   "Resource": [
    //     "arn:aws:iam::*:role/"+lfRoleName,
    //   ]
    // }
    // lakeFormationUser.addToPolicy(iam.PolicyStatement.fromJson(statement6));
    // lakeFormationUser.addToPolicy(iam.PolicyStatement.fromJson(s3BucketStatement));

    // s3bucket.grantReadWrite(lakeFormationRole);
    // s3bucket.grantDelete(lakeFormationRole);
    // s3bucket.grantReadWrite(lakeFormationUser);
    // s3bucket.grantDelete(lakeFormationUser);

    // const result = s3bucket.addToResourcePolicy(new iam.PolicyStatement({
    //   effect: Effect.ALLOW,
    //   actions: [
    //     's3:PutObject',
    //     's3:GetObject',
    //     's3:DeleteObject'],
    //   resources: [
    //     "arn:aws:s3:::"+s3bucket.bucketName,
    //     "arn:aws:s3:::"+s3bucket.bucketName+"/*"],
    //   principals: [new iam.AccountRootPrincipal(), lakeFormationUser],
    // }));

    // const databaseName = props.project_name.replace('-','_')+'_db';
    // const tableName = 'analytics_app_firehose_tb';

    // const analyticsDatabase = new glue.Database(this, 'AnalyticsAppDatabase', {
    //   databaseName: databaseName,
    // });

    // const cfnPermissions = new lakeformation.CfnPermissions(this, 'MyCfnPermissions', {
    //   dataLakePrincipal: {
    //     dataLakePrincipalIdentifier: lakeFormationUser.userArn,
    //   },
    //   resource: {
    //     databaseResource: {
    //       catalogId: analyticsDatabase.catalogId,
    //       name: analyticsDatabase.databaseName,
    //     },
    //     dataLocationResource: {
    //       catalogId: analyticsDatabase.catalogId,
    //       s3Resource: s3bucket.bucketArn,
    //     },
    //   },
    //   permissions: ['ALL','ALTER','CREATE_TABLE','DESCRIBE','DROP'],
    //   permissionsWithGrantOption: ['ALL','ALTER','CREATE_TABLE','DESCRIBE','DROP'],
    // }); 
    

    // new cdk.CfnOutput(this, 'S3 bucket name', { value: s3bucket.bucketName });
    // new cdk.CfnOutput(this, 'Glue database name', { value: databaseName });


    // const analyticsTable = new glue.Table(this, 'AnalyticsAppTable', {
    //   database: analyticsDatabase,
    //   tableName: tableName,
    //   bucket: s3bucket,
    //   s3Prefix: s3Prefix,
    //   columns: [{
    //     name: 'host',
    //     type: glue.Schema.STRING,
    //   },{
    //     name: 'request_time',
    //     type: glue.Schema.STRING,
    //   },{
    //     name: 'time_iso8601',
    //     type: glue.Schema.STRING,
    //   },{
    //     name: 'msec',
    //     type: glue.Schema.STRING,
    //   },{
    //     name: 'remote_addr',
    //     type: glue.Schema.STRING,
    //   },{
    //     name: 'http_x_forwarded_for',
    //     type: glue.Schema.STRING,
    //   },{
    //     name: 'content_type',
    //     type: glue.Schema.STRING,
    //   },{
    //     name: 'content_length',
    //     type: glue.Schema.STRING,
    //   },{
    //     name: 'request_body',
    //     type: glue.Schema.STRING,
    //   }],
    //   partitionKeys: [{
    //     name: 'year',
    //     type: glue.Schema.SMALL_INT,
    //   }, {
    //     name: 'month',
    //     type: glue.Schema.SMALL_INT,
    //   }, {
    //     name: 'day',
    //     type: glue.Schema.SMALL_INT,
    //   }, {
    //     name: 'hour',
    //     type: glue.Schema.SMALL_INT,
    //   }],
    //   partitionIndexes: [{
    //     indexName: props.project_name+'-index', // optional
    //     keyNames: ['year','month','day','hour'],
    //   }], // supply up to 3 indexes
    //   dataFormat: glue.DataFormat.JSON,
    // });

    // CREATE EXTERNAL TABLE analytics_firehose_tb
    // (
    // log string
    // )
    // PARTITIONED BY ( year string, month string, day string, hour string)
    // ROW FORMAT SERDE 'org.apache.hive.hcatalog.data.JsonSerDe'
    // WITH SERDEPROPERTIES ( 'ignore.malformed.json' = 'true')
    // LOCATION 's3://analytics-app-firehose-bucket-11720/analytics-app-data/'
    

  }
}
