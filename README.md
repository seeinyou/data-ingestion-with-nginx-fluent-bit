# analytics-data-collection
The project is a PoC of data ingestion with Nginx and Fluent Bit to BigQuery.
This solution is built with AWS CDK. For more information of CDK, please check the document: https://aws.amazon.com/cdk/.

# Prerequisites:
## AWS
An AWS account
An IAM user has permissions for at least for CloudFormation, Cloud9, and EC2.
For using AWS CDK in a region at the first time, you will need to bootstrap CDK. Please find more details in the document: https://docs.aws.amazon.com/cdk/v2/guide/bootstrapping.html.

## BigQuery
### Enable APIs
BigQuery Connection API 

### Create and export a Google Service Account
Google Service account
Doc: https://cloud.google.com/bigquery/docs/reference/libraries#client-libraries-install-python
Export a GCP service account into a JSON (service_account.json) file and put the file into root/src/lambda/

### The way to export BigQuery Schema
You can also export BigQuery schemas using the command below, and put the schema files into root/src/lambda/bq_schemas/
#### Command:
bq show --schema --format=prettyjson [project_name:dataset.table]

#### An example:
bq show --schema --format=prettyjson us-bq-project-1:data_ingestion_test_1.lambda-target-1

# analytics-data-collection deployment instruction
Create an AWS Cloud9 environment in the region where you want to deploy the project, and upload the ZIP file into the Cloud9 environment

## Extend the EBS volume of Cloud9 (20GB)
Extend the EBS volume to at 20GB in the AWS console. It might take a few minutes.
### Run commands in Cloud9
sudo growpart /dev/nvme0n1 1
sudo xfs_growfs -d /

## Run below commands to deploy the project using AWS CDK
unzip poc-data-ingestion.zip
cd poc-data-ingestion/
npm install
npx cdk deploy --context targetEnv=Dev

## Configure the stack
Please find the configurations of CDK in root/cdk.context.json
