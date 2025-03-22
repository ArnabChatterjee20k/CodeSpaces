import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ssm from "aws-cdk-lib/aws-ssm";
import { Construct } from "constructs";
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class RedisStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    // TODO: make it priavte and only allow instances and the instances
    // FIXME: attach a EBS to it to hold the data in case of db and maintain data across dbs

    // needed vpc id from the other
    const vpc = ec2.Vpc.fromLookup(this, "VpcIdExport", {
        vpcId: ssm.StringParameter.valueFromLookup(this, "VpcId"),
      });
      
    const securityGroup = new ec2.SecurityGroup(this, "Redissecuritygroup", {
      vpc: vpc,
      allowAllOutbound: true,
    });
    securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(22),
      "ssh port"
    );
    securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(6379),
      "redis port"
    );

    const userData = ec2.UserData.forLinux()
    userData.addCommands(
    'yum update -y',
      'yum install -y docker',
      'service docker start',
      'usermod -aG docker ec2-user',
      'systemctl enable docker',
      `docker run -d --name redis-server -p 6379:6379 --restart=always redis`
    )

    const redis = new ec2.Instance(this, "Redis instance", {
      vpc,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T2,
        ec2.InstanceSize.MICRO
      ),
      machineImage: ec2.MachineImage.latestAmazonLinux2(),
      securityGroup: securityGroup,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      associatePublicIpAddress: true,
      keyPair: new ec2.KeyPair(this, "VsCodeServerSSHKeyPair", {
        keyPairName: "RedisSSHKeyPair",
      }),
      userData:userData
    });

    new ssm.StringParameter(this,"RedisURL",{
        parameterName:"redis-uri",
        stringValue:redis.instancePublicIp
    })

    new cdk.CfnOutput(this,"RedisIP",{
        value:redis.instancePublicIp
    })
    
  }
}
