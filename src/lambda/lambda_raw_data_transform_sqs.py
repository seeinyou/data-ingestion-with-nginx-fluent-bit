import os
import boto3
import base64
import gzip
import logging
import json
import zlib
from urllib.parse import unquote
from pprint import pp, pprint


# Environment variables
default_tablename = os.environ['DEFAULT_TABLENAME']
bucket_name = os.environ['S3_BUCKET_NAME']  # Bucket name
new_file_prefix = os.environ['S3_NEW_FILE_PREFIX']  # New file prefix


# Get each part from a S3 object key
def get_file_key_parts(full_path):
    head, tail = os.path.split(full_path)
    return head, tail or os.path.basename(head)


# Convert base64 encoded gzip string to JSON
def gzip_to_json(gzip_str):
    # import json

    # Convert base64 encoded string back to bytes
    base64decoded_str = base64.b64decode(gzip_str.encode('utf-8'))

    # Decompress bytes to bytes
    decompressed_data=zlib.decompress(base64decoded_str, 16+zlib.MAX_WBITS)
    # print('### GZIP STRING:', decompressed_data)

    if decompressed_data:
        json_data = json.loads(decompressed_data)

    return json_data

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


# Initialize a SQS resource
sqs = boto3.resource('sqs')

# Lambda handler
# Read and process each line of a S3 object
# Save the processed logs to a new S3 object
def lambda_handler(event, context):
    # pprint(event)

    # Get queue URL:
    queue_url = convert_sqs_arn_to_url(event['Records'][0]['eventSourceARN'])
    print('### SQS URL: ', queue_url)

    s3_infos = retrieve_s3_from_sqs_event(event)
    
    if not s3_infos or not 'key' in s3_infos:
        # The message has been successfully processed. Remove it from the queue.
        sqsMessage = sqs.Message(queue_url, event['Records'][0]['receiptHandle'])
            
        # Delete the message from the queue
        sqsMessage.delete()

        quit('### Quit: Get S3 inforation from event {} failed!'.format(event))

    # Extract input variables and environment variables
    file_name = s3_infos['key']
    # file_name = event['Records'][0]['s3']['object']['key']  # File name
    file_name = unquote(file_name)
    pprint('File name: {}'.format(file_name)) # DEBUG

    result_list = []
    result_str_list = []
    table_lists = []

    s3_resource = boto3.resource("s3")

    try:
        rsp = s3_resource.Object(bucket_name, file_name).get()
        if rsp["ContentEncoding"] == 'gzip':
            # pprint("Gzip file")
            body = gzip.GzipFile(fileobj=rsp["Body"]).read()
            # pprint(body)
        else:
            pprint("plain file")
            body = rsp["Body"].read()

        # Process each line of the file
        for line in str(body).split('}\\n'):

            if line.find("{") >= 0 and line.find("request_body") > 0:
                format_data = line[line.index("{"):] + "}"
                record_data = json.loads(format_data)
                request_body = record_data['request_body']
                
                if request_body.find('data_list') > 0:

                    pprint("Decode SensorsAnalyticsSDK request body")
                    post_data_arr = request_body.split('&')
                    gzip_flag = False
                    base64_data = str()

                    for post_data in post_data_arr:
                        if 'gzip=1' in post_data:
                            gzip_flag = True
                        if 'H4sIAAAAAAAAE' in post_data:
                            raw_event_data = post_data[len('data_list='):]
                            base64_data = raw_event_data.replace('%2B','+').replace('%2F','/').replace('%3D','=')
                    decode_data = base64.b64decode(base64_data)

                    if gzip_flag:
                        unzip_data = gzip.decompress(decode_data).decode('UTF-8')
                        json_data = json.loads(unzip_data)
                        record_data['request_body'] = json_data
                        pprint('Data: {}'.format(json_data))
                    else:
                        pprint('No gzip Data: {}'.format(decode_data))
                        json_data = json.loads(decode_data)
                        record_data['request_body'] = json_data

                    result_list.append(record_data)
                    result_str_list.append(json.dumps(record_data)) # For exporting to the new line delimited file

                elif request_body.startswith('H4sIAAAAAAAAE'):
   
                    pprint("Decode ThinkingAnalyticsSDK request body")
                    base64_data = request_body.replace('%2B','+').replace('%2F','/').replace('%3D','=')
                    decode_data = base64.b64decode(base64_data)
                    unzip_data = gzip.decompress(decode_data).decode('UTF-8')
                    json_data = json.loads(unzip_data)
                    record_data['request_body'] = json_data
                    pprint('Data: {}'.format(json_data))
                    result_list.append(record_data)
                    result_str_list.append(json.dumps(record_data)) # For exporting to the new line delimited file
                else:
                    pprint(f"Not known format to decode request body {request_body}")

            elif line.find("{") >= 0 and line.find("cost") > 0: # Process Customer_K data
                format_data = line[line.index("{"):] + "}"
                pprint("Decode Customer_K data")
                print('### FORMATTED DATA:', format_data) # JM DEBUG

                record_data = json.loads(format_data)
                record_data['data'] = decrypt_customer_data(record_data['data'])
                # pprint('Data: {}'.format(json_data))

                result_list.append(record_data)

                if 'attribute' in record_data and 'BQ_TABLE_NAME' in record_data['attribute']:
                    table_name = record_data['attribute']['BQ_TABLE_NAME']
                else:
                    table_name = default_tablename

                if not table_name in table_lists:
                    table_lists.append(table_name)

                    print('### TABLE NAME:', table_name)
                    print('### TABLE LISTS:', table_lists)
                    print('### TABLE INDEX:', table_lists.index(table_name))

                # if not table_name in result_str_list: # Create a new element in the list
                    result_str_list.insert(table_lists.index(table_name), [])
                    
                print('### result_str_list:', result_str_list)

                result_str_list[table_lists.index(table_name)].append(json.dumps(record_data)) # For exporting to the new line delimited file
            else:
                print(f"Not valid json line {line}")

        if len(result_str_list) > 0:

            # Write to multiple files as a new line delimited JSON
            for dest_prefix in table_lists:
                result_str = "\n"
                destination = new_file_prefix + dest_prefix + '/' + file_name
                print('### DESTINATION:', destination)

                result_str = result_str.join(result_str_list[table_lists.index(dest_prefix)])

                try: 
                    s3_obj = s3_resource.Object(bucket_name, destination)
                    print('### TARGET: S3 object length = ', s3_obj.content_length)
                    
                except Exception as e:
                    print('### S3 EXCEPTION:', e)
                    s3_resource.Object(bucket_name, destination).put(Body=result_str)
                    print('### SAVE TO S3', destination)
                
            # The message has been successfully processed. Remove it from the queue.
            sqsMessage = sqs.Message(queue_url, event['Records'][0]['receiptHandle'])
            
            # Delete the message from the queue
            sqsMessage.delete()

    except Exception as e:
        print(e)
    

# Decrypt Customer_K data
def decrypt_customer_data(raw_string):
    output = ''

    # Data decryption
    decrypted_str = decryption(raw_string)  # For testing

    # Base64 and gzip decoding
    output = gzip_to_json(decrypted_str)

    return output

# Customer_K data decryption
def decryption(raw_string):
    
    # @TODO - Please insert your decryption algorithm here...
    # decryption() ...

    return raw_string