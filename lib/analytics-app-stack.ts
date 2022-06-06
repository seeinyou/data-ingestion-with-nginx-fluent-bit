import * as cdk from 'aws-cdk-lib';
import { CfnDirectoryConfig } from 'aws-cdk-lib/aws-appstream';
import { Construct } from 'constructs';
import { DataIngestStack } from './data-ingest-stack';
import { DataEnrichStack } from './data-enrich-stack';
import { DataConsumeStack } from './data-consume-stack';

export interface AnalyticsStackProps extends cdk.StackProps {
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
    readonly kafka_connect_secret: string,
    readonly enable_data_enrich: boolean,
    readonly enable_data_enrich_with_sqs: boolean,
    readonly bq_project_name: string,
    readonly bq_dataset: string
}

export class AnalyticsStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: AnalyticsStackProps) {
      super(scope, id, props);

      const dataIngestStack = new DataIngestStack(this, 'data-ingest-stack', {
        project_name: props.project_name,  
        cidr: props.cidr,
        nginx_http_port: props.nginx_http_port,
        fluentbit_log_level: props.fluentbit_log_level,
        asg_min_capacity: props.asg_min_capacity,
        asg_max_capacity: props.asg_max_capacity,
        asg_desired_capacity: props.asg_desired_capacity,
        certificate_arn: props.certificate_arn,
        ingestion_output_target_s3: props.ingestion_output_target_s3,
        ingestion_output_target_kinesis_stream: props.ingestion_output_target_kinesis_stream,
        ingestion_output_target_msk: props.ingestion_output_target_msk,
        kafka_connect_key_id: props.kafka_connect_key_id,
        kafka_connect_secret: props.kafka_connect_secret
      });

      if (props.enable_data_enrich === true) {
        new DataEnrichStack(this, 'data-enrich-stack', {
          project_name: props.project_name,
          vpc: dataIngestStack.clientVpc,
          appSubnetSecurityGroup: dataIngestStack.appSubnetSecurityGroup,
          s3Bucket: dataIngestStack.s3Bucket,
          sqsForS3Notification: props.enable_data_enrich_with_sqs,
          bqProjectName: props.bq_project_name,
          bqDataSet: props.bq_dataset
        });
      }
    }
}