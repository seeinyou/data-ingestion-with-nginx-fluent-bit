
# Data Ingestion With Nginx and Fluent-bit
The project is a PoC of data ingestion with Nginx and Fluent Bit to BigQuery.
This solution is built with AWS CDK. For more information of CDK, please check the document: https://aws.amazon.com/cdk/. 

# Prerequisites:
## AWS
- An AWS account
- An IAM user has permissions for at least for CloudFormation, Cloud9, and EC2.

For using AWS CDK in a region at the first time, you will need to bootstrap CDK. Please find more details in the [CDK Bootstrapping](https://docs.aws.amazon.com/cdk/v2/guide/bootstrapping.html) document.

## BigQuery

### Enable APIs

- BigQuery Connection API

### Create and export a Google Service Account
- Google Service account
Export a [GCP service account](https://cloud.google.com/iam/docs/creating-managing-service-account-keys) into a JSON (service_account.json) file and put the file into root/src/lambda/

### The way to export BigQuery Schema

You can also export BigQuery schemas using the command below, and put the schema files into root/src/lambda/bq_schemas/

#### Command:
> bq show --schema --format=prettyjson [project_name:dataset.table]

#### An example:

> bq show --schema --format=prettyjson us-bq-project-1:data_ingestion_test_1.lambda-target-1

# Deployment instruction

## Deploy with Cloud9
Create an [AWS Cloud9](https://aws.amazon.com/cloud9/) environment in the region where you want to deploy the project, and upload the ZIP file into the Cloud9 environment.

*AWS Cloud9 is a cloud-based integrated development environment (IDE) that lets you write, run, and debug your code with just a browser. It includes a code editor, debugger, and terminal.*

## Extend the EBS volume of Cloud9 (20GB)

Extend the EBS volume to at 20GB in the AWS console, because the default EBS volume (10GB) is not enough for compiling the CDK package . It might take a few minutes. For more information, please check the [extend an EBS volume on Linux](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/recognize-expanded-volume-linux.html) document. 

### Run commands in Cloud9
> lsblk

> sudo growpart /dev/nvme0n1 1

> sudo xfs_growfs -d /

## Run below commands to deploy the project using AWS CDK
> wget "https://github.com/seeinyou/data-ingestion-with-nginx-fluent-bit/archive/refs/heads/master.zip"
> unzip master.zip
> cd data-ingestion-with-nginx-fluent-bit/
> npm install
> npx cdk deploy --context targetEnv=Dev

## Configure the stack

Please find the configurations of CDK in root/cdk.context.json