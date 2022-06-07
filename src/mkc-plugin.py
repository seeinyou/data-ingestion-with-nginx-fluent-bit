# https://github.com/lensesio/stream-reactor/blob/master/kafka-connect-aws-s3/README-sink.md

import boto3
import os
import sys
import time
os.environ["AWS_DEFAULT_REGION"] = "MACRO_FLUENTBIT_OUTPUT_AWS_REGION"
MACRO_KAFKA_CONNECT_SECRET_KEY = sys.argv[1]
MACRO_SERVICE_EXECUTION_ROLE_ARN = sys.argv[2]


client = boto3.client("kafkaconnect")
plugin_response = client.create_custom_plugin(
    contentType="JAR",
    location={
        "s3Location": {
            "bucketArn": "MACRO_S3_BUCKET_ARN",
            "fileKey": "kafka-connect-s3/kafka-connect-aws-s3-2.1.3.1-2.5.0-all.jar"
        }
    },
    name="kafka-connect-s3-plugin"
)
plugin_arn = plugin_response["customPluginArn"]
while plugin_response["customPluginState"] != "ACTIVE":
    time.sleep(10)
    plugin_response = client.describe_custom_plugin(customPluginArn=plugin_arn)
    if plugin_response["customPluginState"] == "CREATE_FAILED":
        print("Plugin failed to activate")
        sys.exit(1)
        
if plugin_response["customPluginState"] == "ACTIVE":
    print("Plugin created successfully")
    connector_response = client.create_connector(
        connectorName="mkc-s3-sink-connector",
        plugins=[
            {
                'customPlugin': {
                    'customPluginArn': plugin_arn,
                    'revision': 1
                }
            },
        ],
        capacity={
            'autoScaling': {
                'maxWorkerCount': 4,
                'mcuCount': 1,
                'minWorkerCount': 1,
                'scaleInPolicy': {
                    'cpuUtilizationPercentage': 20
                },
                'scaleOutPolicy': {
                    'cpuUtilizationPercentage': 80
                }
            }
        },
        connectorConfiguration={
            "connector.class": "io.lenses.streamreactor.connect.aws.s3.sink.S3SinkConnector",
            "key.converter.schemas.enable": "false",
            "connect.s3.kcql": "INSERT INTO MACRO_S3_BUCKET_NAME:mkc-s3-data SELECT * FROM MACRO_KAFKA_TOPIC STOREAS `json` WITH_FLUSH_INTERVAL = 60",
            "aws.region": "MACRO_FLUENTBIT_OUTPUT_AWS_REGION",
            "tasks.max": "2",
            "topics": "MACRO_KAFKA_TOPIC",
            "schema.enable": "false",
            "value.converter.schemas.enable": "false",
            "value.converter": "org.apache.kafka.connect.json.JsonConverter",
            "errors.log.enable": "true",
            "key.converter": "org.apache.kafka.connect.storage.StringConverter",
            "connect.s3.aws.access.key": "MACRO_AWS_ACCESS_KEY_ID",
            "connect.s3.aws.secret.key": MACRO_KAFKA_CONNECT_SECRET_KEY,
            "connect.s3.aws.auth.mode": "Credentials"
        },
        kafkaCluster={
            'apacheKafkaCluster': {
                'bootstrapServers': 'MACRO_KAFKA_BOOTSTRAP_SERVERS',
                'vpc': {
                    'securityGroups': [
                        'MACRO_KAFKA_SECURITY_GROUP_ID',
                    ],
                    'subnets': [
                        'MACRO_KAFKA_SUBNET_ID_1',
                        'MACRO_KAFKA_SUBNET_ID_2',
                    ]
                }
            }
        },
        kafkaClusterClientAuthentication={
            'authenticationType': 'NONE'
        },
        kafkaClusterEncryptionInTransit={
            'encryptionType': 'PLAINTEXT'
        },
        kafkaConnectVersion='2.7.1',
        logDelivery={
            'workerLogDelivery': {
                's3': {
                    'bucket': 'MACRO_S3_BUCKET_NAME',
                    'enabled': True,
                    'prefix': 'mkc-logs'
                }
            }
        },
        serviceExecutionRoleArn=MACRO_SERVICE_EXECUTION_ROLE_ARN,
    )
    if connector_response['connectorState'] == 'RUNNING':
        print("Connector created successfully and is running "+connector_response['connectorArn'])
    else:
        print("Connector creation status: "+connector_response['connectorState'])
else:
    print("Plugin creation failed with error: " + plugin_response["customPluginState"])