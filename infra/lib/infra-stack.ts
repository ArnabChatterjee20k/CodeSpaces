import * as cdk from 'aws-cdk-lib';
import * as ec2 from "aws-cdk-lib/aws-ec2"
import * as iam from "aws-cdk-lib/aws-iam"
import * as autoScaling from "aws-cdk-lib/aws-autoscaling"
import {Asset as S3Asset} from "aws-cdk-lib/aws-s3-assets"
import { Construct } from 'constructs';
import * as path from "path"
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class InfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    const monitorScriptAsset = new S3Asset(this,"MonitorScript",{
      path:path.join(__dirname,"../scripts/monitor.py")
    })

    // VPC
    const vpc = new ec2.Vpc(this,"VsCodeServerVPC")
    // Security Groups
    const securityGroups = new ec2.SecurityGroup(this,"VsCodeServerSG",{
      vpc,
      allowAllOutbound:true
    })
    // ssh
    securityGroups.addIngressRule(ec2.Peer.anyIpv4(),ec2.Port.tcp(22),"ssh port")
    // 10 containers = 10 ports
    securityGroups.addIngressRule(ec2.Peer.anyIpv4(),ec2.Port.tcpRange(8081,8090),"Docker ports")
    // iam role to get used by the all ec2 instances
    const role = new iam.Role(this,"VsCodeServerRole",{
      assumedBy:new iam.ServicePrincipal("ec2.amazonaws.com")
    })
    // SSM role addition for remoate command access
    const ssmRole = iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore")
    role.addManagedPolicy(ssmRole)

    const s3ObjectPolicy = new iam.PolicyStatement({
      actions:["s3:GetObject"],
      resources:[monitorScriptAsset.bucket.arnForObjects("*")]
    })
    role.addToPolicy(s3ObjectPolicy)
    
    // launch template for the auto scaling
    const userData = ec2.UserData.forLinux()
    userData.addCommands(  'yum update -y',
      'yum install -y docker python3',
      'service docker start',
      'usermod -aG docker ec2-user',
      'systemctl enable docker',
      
      // our monitor script to run the docker container monitor
      `aws s3 cp s3://${monitorScriptAsset.s3BucketName}/${monitorScriptAsset.s3ObjectKey} /home/ec2-user/monitor.py`,
      `chmod +x /home/ec2-user/monitor.py`,

      // cron job
      `(crontab -l 2>/dev/null; echo "*/5 * * * * /usr/bin/python3 /home/ec2-user/monitor.py >> /var/log/monitor.log 2>&1") | crontab -`,
      // Run VSCode Server in Docker
      'docker pull codercom/code-server',)
      
    const launchTemplate = new ec2.LaunchTemplate(this,"VsCodeServerTemplate",{
      securityGroup:securityGroups,
      machineImage:ec2.MachineImage.latestAmazonLinux2023(),
      role:role,
      instanceType:new ec2.InstanceType("t2.micro"),
      userData:userData,
      associatePublicIpAddress:true,
      keyPair:new ec2.KeyPair(this,"VsCodeServerSSHKeyPair",{
        keyPairName:"VsCodeServerSSHKeyPair",
      })
    })

    // create ASG
    const asg = new autoScaling.AutoScalingGroup(this,"VsCodeServerASG",{
      vpc,
      maxCapacity:4,
      minCapacity:1,
      desiredCapacity:2,
      launchTemplate,
      vpcSubnets:{subnetType:ec2.SubnetType.PUBLIC}
    })
    asg.scaleOnCpuUtilization("CpuScaling",{targetUtilizationPercent:50})
    // get public ip
    new cdk.CfnOutput(this,"VsCodeServer",{
      value:asg.autoScalingGroupName
    })
  }
}
