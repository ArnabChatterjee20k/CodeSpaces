#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { RedisStack } from "../lib/redis-stack";
import { ASGStack } from "../lib/asg-stack";
import { InfraStack } from "../lib/infra-stack";
const app = new cdk.App();
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};
const infraStack = new InfraStack(app, "InfraStack", {
  env
});

const redisStack = new RedisStack(app, "RedisStack",{env})
redisStack.addDependency(infraStack);

const asgStack = new ASGStack(app,"ASGStack",{env})
asgStack.addDependency(infraStack)
asgStack.addDependency(redisStack)