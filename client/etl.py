from pyspark.sql import SparkSession
spark = SparkSession.builder.appName("bakery-csv-to-parquet").getOrCreate()
df_bakery = spark.read.format("csv").option("header", "true").option("delimiter", ",").option("inferSchema", "true").load(f"s3a://aws-quickstart-qiaow
02/links.csv")
df_bakery.write.format("parquet").save(f"s3a://aws-quickstart-qiaow02/p02/")