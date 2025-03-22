import { CloudWatchClient, GetMetricStatisticsCommand, Statistic } from "@aws-sdk/client-cloudwatch";
import { AutoScalingClient, DescribeAutoScalingInstancesCommand } from "@aws-sdk/client-auto-scaling";

const cloudWatchClient = new CloudWatchClient({ region: process.env.AWS_REGION });
const autoScalingClient = new AutoScalingClient({ region: process.env.AWS_REGION });

async function getAutoScalingInstances() {
    try {
        const command = new DescribeAutoScalingInstancesCommand({});
        const response = await autoScalingClient.send(command);
        return response.AutoScalingInstances?.map(instance => instance.InstanceId) || [];
    } catch (error) {
        console.error("Error fetching Auto Scaling instances:", error);
        return [];
    }
}

async function getMetric(instanceId: string, metricName: string, namespace: string) {
    const command = new GetMetricStatisticsCommand({
        Namespace: namespace,
        MetricName: metricName,
        Dimensions: [{ Name: "InstanceId", Value: instanceId }],
        StartTime: new Date(Date.now() - 5 * 60 * 1000), // Last 5 minutes
        EndTime: new Date(),
        Period: 60, // 1-minute intervals
        Statistics: ["Average"],
    });

    try {
        const response = await cloudWatchClient.send(command);
        return response.Datapoints?.length ? response.Datapoints[0]["Average"] : null;  // ✅ FIXED
    } catch (error) {
        console.error(`Error fetching ${metricName} for ${instanceId}:`, error);
        return null;
    }
}

export async function getASGInstancesMetrics() {
    const instanceIds = await getAutoScalingInstances();
    if (!instanceIds.length) return [];

    const metrics = await Promise.all(instanceIds.map(async (instanceId) => {
        const cpuUsage = await getMetric(instanceId as string, "CPUUtilization", "AWS/EC2");
        // const memoryUsage = await getMetric(instanceId, "MemoryUtilization", "CWAgent"); // Memory requires CloudWatch Agent

        return { instanceId, cpuUsage};
    }));

    console.log("ASG Instance Metrics:", JSON.stringify(metrics, null, 2));
    return metrics;
}
