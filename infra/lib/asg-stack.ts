import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as autoScaling from "aws-cdk-lib/aws-autoscaling";
import { Construct } from "constructs";

interface ASGStackProps extends cdk.StackProps {
  vpc: ec2.IVpc;
}

export class ASGStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ASGStackProps) {
    super(scope, id, props);
    const vpc = props.vpc;
    // Security Groups
    const securityGroups = new ec2.SecurityGroup(this, "VsCodeServerSG", {
      vpc,
      allowAllOutbound: true,
    });
    // ssh
    securityGroups.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(22),
      "ssh port"
    );
    // control-plane and the proxy
    securityGroups.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(8000),
      "Control Plane port"
    );
    securityGroups.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(5000),
      "Proxy port"
    );

    // 10 containers = 10 ports
    // TODO: export port 5000 and port 8000
    securityGroups.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcpRange(8081, 8090),
      "Docker ports"
    );
    // iam role to get used by the all ec2 instances
    const role = new iam.Role(this, "VsCodeServerRole", {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
    });

    // HACK: cat /var/log/cloud-init-output.log in the instance to see what commands ran
    // or to have a view tail /var/log/cloud-init-output.log -f
    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      "#!/bin/bash",
      "set -e",

      "sudo apt-get update -y",
      "sudo apt-get install -y git curl wget software-properties-common",

      // Install Docker with a timeout of 30 seconds
      "curl -fsSL https://get.docker.com -o get-docker.sh",
      "bash get-docker.sh || { echo 'Docker install failed'; exit 1; }",

      // Add ubuntu user to docker group
      "sudo usermod -aG docker ubuntu",

      "echo '--- Current working directory ---'",
      "pwd",
      // cloning to /home/ubuntu/CodeSpaces -> /home/ubuntu is present already
      "echo '--- Cloning repository ---'",
      "git clone https://github.com/ArnabChatterjee20k/CodeSpaces /home/ubuntu/CodeSpaces",

      "echo '--- Listing contents of /home/ubuntu/CodeSpaces/control-plane ---'",
      "ls -la /home/ubuntu/CodeSpaces/control-plane || echo 'control-plane directory missing'",

      "echo '--- Changing ownership ---'",
      "sudo chown -R ubuntu:ubuntu /home/ubuntu/CodeSpaces",

      "echo '--- Listing contents of /home/ubuntu/CodeSpaces ---'",
      "ls -la /home/ubuntu/CodeSpaces",

      "echo '--- Making start.sh executable ---'",
      "sudo chmod +x /home/ubuntu/CodeSpaces/control-plane/start.sh || echo 'start.sh not found'",

      "echo '--- Running start.sh ---'",
      "bash -c 'cd /home/ubuntu/CodeSpaces/control-plane && ./start.sh || echo start.sh failed'"
    );

    const launchTemplate = new ec2.LaunchTemplate(
      this,
      "VsCodeServerTemplate",
      {
        securityGroup: securityGroups,
        // ubuntu AMI
        machineImage: ec2.MachineImage.genericLinux({
          "us-east-1": "ami-020cba7c55df1f615",
        }),
        role: role,
        instanceType: new ec2.InstanceType("t2.micro"),
        userData: userData,
        associatePublicIpAddress: true,
        keyPair: new ec2.KeyPair(this, "VsCodeServerSSHKeyPair", {
          keyPairName: "VsCodeServerSSHKeyPair",
        }),
      }
    );

    // create ASG
    const asg = new autoScaling.AutoScalingGroup(this, "VsCodeServerASG", {
      vpc,
      maxCapacity: 1,
      minCapacity: 1,
      // desiredCapacity: 1,
      launchTemplate,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
    });

    // for usage by service discovery like prometheus server
    cdk.Tags.of(asg).add("SERVICE_NAME","CONTROL_PLANE")

    asg.scaleOnCpuUtilization("CpuScaling", { targetUtilizationPercent: 50 });
    // get public ip
    new cdk.CfnOutput(this, "VsCodeServer", {
      value: asg.autoScalingGroupName,
    });
    asg.scaleOnCpuUtilization("ScaleDownOnLowLoad", {
      targetUtilizationPercent: 30,
      cooldown: cdk.Duration.minutes(5),
    });
  }
}
