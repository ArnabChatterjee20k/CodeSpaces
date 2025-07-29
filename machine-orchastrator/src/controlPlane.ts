export interface Container {
  user_id: string;
  container_id: string;
  port: number;
}
export interface ContainerReport {
  count: number;
  containers: Container[];
}

/**
 * To create a control plane instance of a specific asg instance
 */
export class ControlPlaneInstance {
  public readonly controlPlaneURL: string;

  constructor(public readonly ip: string) {
    this.controlPlaneURL = `http://${ip}:8000`;
  }

  public async getReport(): Promise<ContainerReport> {
    const res = await fetch(`${this.controlPlaneURL}/report`, {
      headers: { "X-ORCHASTRATOR_KEY": `${ControlPlane.getToken()}` },
    });
    return res.json();
  }

  public async startContainer(userToken: string): Promise<void> {
    const res = await fetch(`${this.controlPlaneURL}/start`, {
      method: "post",
      body: JSON.stringify({ user_id: userToken }),
      headers: { "X-ORCHASTRATOR_KEY": `${ControlPlane.getToken()}`,      "Content-Type": "application/json",
    },
    });
    return res.json();
  }
}

// ControlPlane manager to manage the instances
export class ControlPlane {
  private static sharedControlToken: string;

  public static registerToken(token: string) {
    ControlPlane.sharedControlToken = token;
  }

  public static getToken(): string {
    if (!ControlPlane.sharedControlToken) {
      throw new Error("Token not registered");
    }
    return ControlPlane.sharedControlToken;
  }

  public get(ip: string): ControlPlaneInstance {
    return new ControlPlaneInstance(ip);
  }
}

export const getControlPlane = () => {
  return new ControlPlane();
};
