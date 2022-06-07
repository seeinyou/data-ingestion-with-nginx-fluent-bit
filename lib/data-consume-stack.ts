import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as kinesis from 'aws-cdk-lib/aws-kinesis';
import * as firehose from '@aws-cdk/aws-kinesisfirehose-alpha';
import * as destinations from '@aws-cdk/aws-kinesisfirehose-destinations-alpha';
import { Construct } from 'constructs';

export interface DataConsumeStackProps {
    readonly project_name: string
}

export class DataConsumeStack extends Construct {
    constructor(scope: Construct, id: string, props: DataConsumeStackProps) {
        super(scope, id);
        
    }
}
