import getCache from "./cache.js";
import { ASG, getASG, type ASGInstance } from "./asg.js";
import {
  ControlPlane,
  getControlPlane,
  type ContainerReport,
} from "./controlPlane.js";

type OrchastratorReport = ASGInstance & ContainerReport & { load: number };
interface CacheInstanceDetails {
  ip: string;
  count: string;
  metric: string;
}

const FIVE_MINUTES_SECONDS_SECONDS = 5 * 60;
const ONE_MINUTE_MILLISECOND = 1 * 60 * 1000;
const MAX_EXPECTED_CONTAINER = 10;

export class Orchastrator {
  private controlPlaneManager: ControlPlane;
  private asg: ASG;
  public constructor() {
    this.controlPlaneManager = getControlPlane();
    this.asg = getASG();
  }

  public async getReport(): Promise<OrchastratorReport[]> {
    const asgReport = await this.asg.getReport();

    const containerReportsOfEachInstance = await Promise.allSettled(
      asgReport.map(async (asgInstance) => {
        try {
          const controlPlane = this.controlPlaneManager.get(asgInstance.ip);
          const containerReport = await controlPlane.getReport();
          // HACK: using this load we can use the redis sorted set and zrange to get the lowest load instance
          const load = this.getLoadOfInstance(
            containerReport.count,
            asgInstance.metric || 0
          );
          return {
            ...asgInstance,
            ...containerReport,
            load,
          } satisfies OrchastratorReport;
        } catch (err) {
          console.error(`Failed to fetch report for ${asgInstance.id}:`, err);
          throw err;
        }
      })
    );

    const mergedReports: OrchastratorReport[] = containerReportsOfEachInstance
      .filter(
        (result): result is PromiseFulfilledResult<OrchastratorReport> =>
          result.status === "fulfilled"
      )
      .map((result) => result.value);

    return mergedReports;
  }
  private getLoadOfInstance(containerCount: number, cpu: number) {
    /**
     * good asg to asign = lower container and lower cpu
     * load increases with containers count and cpu
     * weight of containers count is more here than cpu
     */

    // constants
    const CONTAINER_WEIGHT = 0.6;
    const CPU_WEIGHT = 0.4;
    const MAX_EXPECTED_CPU = 100;

    // normalising values to 0 to 1
    const normalisedContainerCount = Math.min(
      1,
      containerCount / MAX_EXPECTED_CONTAINER
    );
    const normalisedCpu = Math.min(1, cpu / MAX_EXPECTED_CPU);

    return (
      CONTAINER_WEIGHT * normalisedContainerCount + CPU_WEIGHT * normalisedCpu
    );
  }

  public async getFreeInstace(): Promise<CacheInstanceDetails | null> {
    const cache = await getCache();
    let retries = 0;
    while (retries < 5) {
      console.log(`${retries > 0 ? `[Retry ${retries}] ` : ''}Getting instance from pool...`);
      const instancePool = await cache.zRange("instancePool", 0, 0);
      console.log("Fetched from pool:", instancePool);
      const instanceId = instancePool.length ? instancePool[0] : null;
      if (!instanceId) {
        console.warn("No instance ID found in pool.");
        return null;
      }
  
      const rawInstance = await cache.hGetAll(`instance:${instanceId}`);
      const fetchedInstance = rawInstance as unknown as CacheInstanceDetails;
      if (!fetchedInstance || Object.keys(fetchedInstance).length === 0) {
        console.warn("Empty instance hash found, retrying...");
        retries++;
        continue;
      }
  
      const { count } = fetchedInstance;
      if (parseInt(count) >= MAX_EXPECTED_CONTAINER) {
        console.warn("Instance is full, retrying...");
        retries++;
        continue;
      }

      return fetchedInstance;
    }
  
    console.log("No available instance found after retries.");
    return null;
  }

  private async monitor() {
    const cache = await getCache();
    const atomicCacheOperation = cache.multi();
    const instanceDetails = await this.getReport();
    await Promise.allSettled(
      instanceDetails.map(async (instance) => {
        const key = `instance:${instance.id}`;
        atomicCacheOperation.hSet(key, {
          ip: instance.ip,
          count: instance.count.toString(),
          metric: (instance.metric || -1).toString(),
        } satisfies CacheInstanceDetails);
        atomicCacheOperation.zAdd("instancePool", {
          score: instance.load,
          value: instance.id as string,
        });
        atomicCacheOperation.expire(key, FIVE_MINUTES_SECONDS_SECONDS);
      })
    );
    await atomicCacheOperation.exec();
  }

  /**
   * If we directly use setInterval then task will start even if the last isn't completed
   * better to call setTimeout after sync in recursive fashion to queue up tasks or use a queue
   */
  public async startSync(interval: number = ONE_MINUTE_MILLISECOND) {
    await this.monitor();
    // setTimeout(this.startSync.bind(this, interval), interval);
    setTimeout(()=>this.startSync(), interval);
  }
}
