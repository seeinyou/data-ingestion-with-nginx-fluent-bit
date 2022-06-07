# !pip install tqdm
# !pip install requests
# !pip install boto3

import datetime
import tqdm
import requests
import secrets
from multiprocessing import cpu_count
from tqdm.contrib.concurrent import process_map
import boto3

url = 'https://uba.demo.solutions.aws.a2z.org.cn/log'
MAX_NUMBER_OF_RECORDS = 100000
obj_key_list = list()
secret_generator=secrets.SystemRandom()

LUT_IP_TO_COUNTRY_CODE = {
    #Country USA
    "192.0.2.3": 1000,
    #County JPN
    "10.0.0.0": 2000,
    #County UAE
    "1.2.3.4": 5000,
}

def get_country_from_ip(ipaddress):
    try:
        return LUT_IP_TO_COUNTRY_CODE[ipaddress]
    except Exception as e:
        # unknown IP address, map to random integer
        return secret_generator.randint(10000,50000)

# bucket='cf-templates-ndy9ol07w67y-us-east-1'
# s3_resource = boto3.resource("s3")
# my_bucket = s3_resource.Bucket(bucket)
# for obj in my_bucket.objects.all():
#     obj_key_list.append(obj.key)

# def post_data_from_s3(obj_key):
#     try:
#         print(obj_key)
#         rsp = s3_resource.Object(bucket, obj_key).get()
#         body = rsp["Body"].read()
#         for line in str(body).split('\\n'):
#             response = requests.post(url, line)
#             #print(response.status_code)
#     except Exception as e:
#         print(e)

def generate_random_data():
    #Create a list of Product Codes
    LIST_PRODUCT_CODE = [3150, 4150, 6150]
    for i in range(MAX_NUMBER_OF_RECORDS):
        remote_ip = secret_generator.choices(list(LUT_IP_TO_COUNTRY_CODE.keys()), weights=(1000,1000,1000))
        remote_ip = remote_ip[0]
        product_code = secret_generator.choice(LIST_PRODUCT_CODE)
        # Generate random CustomerId
        customerId = secret_generator.randint(6000000, 9000000)
        # Generate country code from the predefined country codes
        country_code = get_country_from_ip(remote_ip)
        # Generate random 'OK','FAIL', and 'PENDING' transactionStatus
        transactionStatus = secret_generator.choices(list(["OK","FAIL","PENDING"]), weights=(1000,50,250))
        transactionStatus = transactionStatus[0]
        # Random transaction amount
        transactionAmount = secret_generator.randint(25,200)
        timestamp = datetime.datetime.now()
        json_str_pdtns = """{ "customerId": """"" + str(customerId) + """, "transactionAmount": """"" + str(transactionAmount) + """, "transactionStatus": """"\"" + str(transactionStatus) + """\", "productCode": """"\"" + str(product_code) + """\", "countryCode": """"" + str(country_code) + """, "transactionTime": """"\"" + str(timestamp) + """\", "day_of_week": """"" + str(timestamp.day) + """, "hour_of_day": """"" + str(timestamp.hour) + """ }"""""
        obj_key_list.append(json_str_pdtns)


def post_data_from_random(obj_key):
    try:
        print(obj_key)
        response = requests.post(url, obj_key)
    except Exception as e:
        print(e)
    
workers = 2 * cpu_count()
print(f'workers={workers}')

while True:
    generate_random_data()
    process_map(post_data_from_random, obj_key_list, max_workers=workers)