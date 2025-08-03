#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { ASGStack } from "../lib/asg-stack";
import { InfraStack } from "../lib/infra-stack";
import { MetricStack } from "../lib/metric-stack";
const app = new cdk.App();
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};
const infraStack = new InfraStack(app, "InfraStack", {
  env,
});

const asgStack = new ASGStack(app, "ASGStack", { env, vpc: infraStack.vpc });
const metricStack = new MetricStack(app, "MetricStack", {
  env,
  vpc: infraStack.vpc,
});

metricStack.addDependency(infraStack);
asgStack.addDependency(infraStack);
asgStack.addDependency(metricStack);
