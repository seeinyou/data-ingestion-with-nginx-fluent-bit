#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AnalyticsStack } from '../lib/analytics-app-stack';


const app = new cdk.App();
const env = app.node.tryGetContext('env')
var targetEnv = app.node.tryGetContext('targetEnv')



if (targetEnv == 'Dev') {
    new AnalyticsStack(app, 'uba-app-stack', env['Dev']);
}
