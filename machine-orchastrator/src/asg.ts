// https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cloudwatch/
import {
  CloudWatchClient,
  GetMetricDataCommand,
  type GetMetricDataCommandInput,
} from "@aws-sdk/client-cloudwatch";
import {
  AutoScalingClient,
  DescribeAutoScalingInstancesCommand,
} from "@aws-sdk/client-auto-scaling";
import { DescribeInstancesCommand, EC2Client } from "@aws-sdk/client-ec2";

export interface ASGInstance {
  ip: string;
  id: string | null;
  metric: number | null;
}

export class ASG {
  private static awsRegion: string;
  private cloudWatchClient: CloudWatchClient;
  private autoScalingClient: AutoScalingClient;
  private ec2Client: EC2Client;

  public constructor() {
    if (!ASG.awsRegion) throw new Error("aws region not set");
    const region = ASG.getRegion();
    this.cloudWatchClient = new CloudWatchClient({
      region: region,
    });
    this.autoScalingClient = new AutoScalingClient({
      region: region,
    });
    this.ec2Client = new EC2Client({ region: region });
  }

  static setRegion(awsRegion: string) {
    ASG.awsRegion = awsRegion;
  }
  static getRegion() {
    return ASG.awsRegion;
  }

  public async getReport(): Promise<ASGInstance[]> {
    const instaceIds = await this.getInstanceIds();
    try {
      const [ips, metrics] = await Promise.all([
        this.getInstanceIps(instaceIds),
        this.getCpuMetrics(instaceIds),
      ]);
      return instaceIds.map((id) => {
        const ip = id in ips ? ips[id] : null;
        const metric = id in metrics ? metrics[id] : null;
        return { id, ip, metric } as ASGInstance;
      });
    } catch (error) {
      return [];
    }
  }

  private async getInstanceIds(): Promise<string[]> {
    const command = new DescribeAutoScalingInstancesCommand({});
    const response = await this.autoScalingClient.send(command);
    const instances = response.AutoScalingInstances || [];
    return instances
      .map((instance) => instance.InstanceId)
      .filter((id): id is string => typeof id === "string");
  }

  private async getInstanceIps(
    instanceIds: string[]
  ): Promise<Record<string, string>> {
    const command = new DescribeInstancesCommand({
      InstanceIds: instanceIds,
    });

    const response = await this.ec2Client.send(command);
    const reservations = response.Reservations || [];

    const ipMap: Record<string, string> = {};

    reservations
      .flatMap((reservation) => reservation.Instances || [])
      .forEach((instance) => {
        const id = instance.InstanceId;
        const ip = instance.PublicIpAddress;
        if (typeof id === "string" && typeof ip === "string") {
          ipMap[id] = ip;
        }
      });

    return ipMap;
  }

  private async getCpuMetrics(
    instanceIds: string[]
  ): Promise<Record<string, number | null>> {
    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

    const metricDataQueries: GetMetricDataCommandInput["MetricDataQueries"] =
      instanceIds.map((instanceId, index) => ({
        Id: `cpu${index}`, // not instanceId as it must be alphanumeric and no special characters
        Label: instanceId,
        MetricStat: {
          Metric: {
            Namespace: "AWS/EC2",
            MetricName: "CPUUtilization",
            Dimensions: [{ Name: "InstanceId", Value: instanceId }],
          },
          Period: 60, // seconds
          Stat: "Average",
        },
        ReturnData: true,
      }));

    const command = new GetMetricDataCommand({
      StartTime: fiveMinutesAgo,
      EndTime: now,
      MetricDataQueries: metricDataQueries,
    });

    const response = await this.cloudWatchClient.send(command);
    const results: Record<string, number | null> = {};
    for (const result of response.MetricDataResults ?? []) {
      const instanceId = result?.Label;
      const averageMetric = result.Values?.[0];
      // averageMetric can be 0 as well
      if (instanceId && typeof averageMetric === "number")
        results[instanceId] = averageMetric;
    }
    return results;
  }
}

export const getASG = () => {
  return new ASG();
};
