import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

interface MetricStackProps extends cdk.StackProps {
  vpc: ec2.IVpc;
}

export class MetricStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: MetricStackProps) {
    super(scope, id, props);
    const vpc = props.vpc;

    const role = new iam.Role(this, "MetricServerRole", {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
    });

    role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonEC2ReadOnlyAccess")
    );

    const securityGroups = new ec2.SecurityGroup(this, "MetricServerSG", {
      vpc,
      allowAllIpv6Outbound: true,
    });
    // ssh port
    securityGroups.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(22),
      "ssh port"
    );
    // http ports
    securityGroups.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(9000),
      "http port"
    );

    const envVars = {
      CDK_DEFAULT_REGION: process.env.CDK_DEFAULT_REGION,
      AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
      AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
      AWS_DEFAULT_REGION: process.env.AWS_DEFAULT_REGION,
      AWS_REGION: process.env.AWS_REGION,
    };

    const userData = ec2.UserData.forLinux();

    userData.addCommands(
      "#!/bin/bash",
      "set -e",

      "sudo apt-get update -y",
      "sudo apt-get install -y git curl wget ca-certificates software-properties-common gnupg lsb-release",

      // Install Docker
      "curl -fsSL https://get.docker.com -o get-docker.sh",
      "sh get-docker.sh || { echo 'Docker install failed'; exit 1; }",

      // Add user to Docker group
      "sudo usermod -aG docker ubuntu",

      // Install Docker Compose (v2 plugin style)
      "DOCKER_CONFIG=/usr/lib/docker/cli-plugins",
      "mkdir -p $DOCKER_CONFIG",
      "curl -SL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 -o $DOCKER_CONFIG/docker-compose",
      "chmod +x $DOCKER_CONFIG/docker-compose",

      "echo '--- Cloning repo ---'",
      "git clone https://github.com/ArnabChatterjee20k/CodeSpaces /home/ubuntu/CodeSpaces",

      "sudo chown -R ubuntu:ubuntu /home/ubuntu/CodeSpaces"
    );

    // for creating a .env inside the /Codespaces/metrics
    Object.entries(envVars).forEach(([key, value]) => {
      if (value) {
        // ubuntu is the user in ubuntu
        userData.addCommands(`echo "export ${key}=${value}" >> /etc/profile`);
        userData.addCommands(`echo "${key}=${value}" >> /home/ubuntu/.env`);
      }
    });

    // running the docker compose
    userData.addCommands(
      "echo '--- Running docker compose up ---'",
      "cd /home/ubuntu/CodeSpaces/metrics",
      "docker compose up -d || echo 'docker compose failed'"
    );

    // If needed launch template to create with ec2 instance -> use cfninstance and cfnlaunchtemplate
    new ec2.Instance(this, "MetricServerInstance", {
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      securityGroup: securityGroups,
      instanceType: new ec2.InstanceType("t2.micro"),
      machineImage: ec2.MachineImage.genericLinux({
        "us-east-1": "ami-020cba7c55df1f615",
      }),
      role: role,
      userData: userData,
      associatePublicIpAddress: true,
      keyPair: new ec2.KeyPair(this, "MetricServerSSHKeyPair", {
        keyPairName: "MetricServerSSHKeyPair",
      }),
    });
  }
}
