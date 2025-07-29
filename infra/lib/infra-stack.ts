import * as cdk from 'aws-cdk-lib';
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ssm from "aws-cdk-lib/aws-ssm";
import { Construct } from 'constructs';

export class InfraStack extends cdk.Stack {
  // for using vpc across other stacks so that we dont have to use ssm
  public readonly vpc: ec2.Vpc;
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ✅ Create a Free-Tier Friendly VPC
    const vpc = new ec2.Vpc(this, "VsCodeServerVPC", {
      maxAzs: 1, // ✅ Limits to 1 AZ (Free-Tier Friendly)
      natGateways: 0, // ✅ Disables NAT Gateways to avoid extra costs
      subnetConfiguration: [
        {
          name: "PublicSubnet",
          subnetType: ec2.SubnetType.PUBLIC, // ✅ Only creates public subnets (no NAT needed)
        }
      ]
    });
    this.vpc = vpc

    // ✅ Store VPC ID in SSM Parameter Store
    new ssm.StringParameter(this, "VpcIdExport", {
      parameterName: "/infra/vpc-id", // ✅ Use a proper SSM path format
      stringValue: vpc.vpcId
    });

    // ✅ Output VPC ID for easy reference
    new cdk.CfnOutput(this, "VpcIdOutput", {
      value: vpc.vpcId,
      description: "The VPC ID for the VsCodeServerVPC",
    });
  }
}
