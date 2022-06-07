import boto3
import json
import logging
import os
from google.cloud import bigquery

logger = logging.getLogger(__name__)

# Evironment variables
region = os.environ['REGION']
default_tablename = os.environ['DEFAULT_TABLENAME']
bq_project = os.environ['BQ_PROJECT']
bq_dataset = os.environ['BQ_DATASET']

config = {'bqDataset': bq_dataset, 'bqTargetTable': default_tablename}

# Initialize S3 client
s3_client = boto3.client('s3')

# Initialize a SQS resource
sqs = boto3.resource('sqs')

# Get the filename part for a S3 object key
# The Recollect filekey without path
# Return value format: foo.bar
def get_file_key(full_path):
    import ntpath

    head, tail = ntpath.split(full_path)
    return tail or ntpath.basename(head)

# Download a file from S3 and save it locally
def download_file_from_s3(bucket, key, local_path):
    filename = get_file_key(key)

    from urllib.parse import unquote
    key = unquote(key)

    print('### S3 KEY: ', key)  #Debug

    download_path = local_path + filename
    print('### DOWNLOAD PATH: ', download_path) # Debug
    
    # Download file from a S3 bucket
    download_res = s3_client.download_file(bucket, key, download_path)
    print('### DOWNLOAD RESULT: ', os.path.isfile(download_path)) # Debug
    
    if os.path.isfile(download_path):
        return download_path
    else:
        return False


def load_bq_schema(bq_table_name):
    # Locate the schema json file - you can export the schema into a json file from BigQuery
    schema_file_name = './bq_schemas/' + bq_table_name + '.json'
    bq_schema_arr = []

    if os.path.isfile(schema_file_name):
        # Load the schema json file
        with open(schema_file_name) as f:
            bq_schema = json.loads(f.read())

            if bq_schema:   
            
                for field in bq_schema:
                    bq_schema_arr.append(bigquery.SchemaField(field['name'], field['type'], field['mode']))
    else:
        print('### LOAD BQ SCHEMA FAILED, AUTO DETECT THE SCHEMA!')

    return bq_schema_arr


# Define BigQuery load job config
def get_load_job_config(client, dataset_id, table_id, file_type='JSON', source_uris=''):
    # Construct a BigQuery table reference
    table_ref = client.dataset(dataset_id).table(table_id)

    # Load the data from a file into the table
    job_config = bigquery.LoadJobConfig()
    job_config.ignore_unknown_values = True
    job_config.max_bad_records = 0
    # job_config.write_disposition = bigquery.WriteDisposition.WRITE_TRUNCATE # Debug - Truncate table for testing

    # Load BigQuery schema from pre-defined json file
    schema = load_bq_schema(table_id)

    if file_type == 'JSON':
        job_config.source_format = bigquery.SourceFormat.NEWLINE_DELIMITED_JSON
    elif file_type == 'CSV':
        job_config=bigquery.SourceFormat.CSV
        job_config.skip_leading_rows = 1

    if len(schema) > 0: # Use pre-defined BigQuery schema
        job_config.autodetect = False
        job_config.schema = schema
        # job_config.schema_update_options = 'ALLOW_FIELD_ADDITION'
    else:
        job_config.autodetect = True
        # job_config.schema_update_options = 'ALLOW_FIELD_ADDITION'

    return job_config

# Load a file into BigQuery
def load_file_to_bq(file_path):
    # Construct a BigQuery client object with credentials in the service_account.json
    bq_client = bigquery.Client.from_service_account_json('service_account.json')

    dataset = bq_client.dataset(config['bqDataset'])
    table_id = config['bqDataset'] + '.' + config['bqTargetTable']

    print(table_id)

    # load table from file begins
    ## Get job config
    # job_config = get_load_job_config(bq_client, dataset.dataset_id, table_id, [file_path])
    job_config = get_load_job_config(bq_client, dataset.dataset_id, table_id, 'JSON')
    print('### JOB CONFIG: ', job_config) # Debug

    ## Load the file
    with open(file_path, "rb") as source_file:
        job = bq_client.load_table_from_file(source_file, table_id, job_config=job_config)

    job.result()  # Waits for the job to complete.

    # Debug
    print('LOAD JOB COMPLETED: ', job.state)
    print('Loaded {} rows into {}:{}.'.format(job.output_rows, dataset, table_id))

    return job.output_rows
    # Load table from file ends


# Retrieve S3 information from a SQS message
def retrieve_s3_from_sqs_event(event, index=0):
    print('### EVENT:', event)

    if 'Records' in event:
        queueMessageBody = event['Records'][0]['body']
        qMessage = json.loads(queueMessageBody)
        print('### SQS MESSAGE:', qMessage)
        
        if 'Records' in qMessage:
            s3_msg = qMessage;
            s3_bucket = s3_msg['Records'][index]['s3']['bucket']['name']
            s3_key = s3_msg['Records'][index]['s3']['object']['key']
            s3_eTag = s3_msg['Records'][index]['s3']['object']['eTag']
            print("S3 Bucket {} ; S3 Key {} ; S3 eTag {}\n".format(s3_bucket, s3_key, s3_eTag))
            
        else:
            return None
    else:
        return None

    return {'bucket': s3_bucket, 'key': s3_key, 'eTag': s3_eTag}


def convert_sqs_arn_to_url(sqs_arn):
    StrSplit = sqs_arn.split(":")
    service = StrSplit[2]
    region = StrSplit[3]
    accountId = StrSplit[4]
    queueName = StrSplit[5]
    
    queueUrl = "https://" + service + "." + region + ".amazonaws.com/" + accountId + '/' + queueName
    
    return queueUrl


# Receive SQS message of a S3 file create event
# and load the file into BigQuery
# S3 file naming rule: S3_bucket/processed-nginx-logs/BQ_TABLE_NAME/yyyy/mm/dd/hh/mm/BQ_TABLE_NAME.yyyymmddhhmmss.json
def lambda_handler(event, context):
    print('### Event:', event)

    # Get queue URL:
    queue_url = convert_sqs_arn_to_url(event['Records'][0]['eventSourceARN'])
    print('### SQS URL: ', queue_url)

    # Get S3 object information
    # s3Details = event['Records'][0]['s3']
    # s3Bucket  = s3Details['bucket']['name']
    # s3Key     = s3Details['object']['key']
    # s3ETag    = s3Details['object']['eTag'] # For queue messages to Textract API
    s3_infos = retrieve_s3_from_sqs_event(event)
    
    if not s3_infos:
        print('### RETRIEVE S3 INFORMATON FAILED!')
        return False
    
    s3Bucket = s3_infos['bucket']
    s3Key    = s3_infos['key']
    s3ETag   = s3_infos['eTag'] # For queue messages to Textract API

    filename = download_file_from_s3(s3Bucket, s3Key, '/tmp/')
    print('### FILENAME: ', filename) # Debug

    if filename:
        # Load the file into BigQuery
        load_result = load_file_to_bq(filename)
        
        # The message has been successfully processed. Remove it from the queue.
        sqsMessage = sqs.Message(queue_url, event['Records'][0]['receiptHandle'])
            
        # Delete the message from the queue
        sqsMessage.delete()

        print('### LOAD RESULT: ', load_result) # Debug
    else:
        print('### ERROR: File not found')
        # The message has been successfully processed. Remove it from the queue.
        sqsMessage = sqs.Message(queue_url, event['Records'][0]['receiptHandle'])
            
        # Delete the message from the queue
        sqsMessage.delete()
        print('### SQS: DELETE MESSAGE!')
        
        return False

if __name__ == '__main__':
    lambda_handler({}, {})