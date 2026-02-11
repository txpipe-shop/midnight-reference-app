import { Logger } from "pino";
import { DockerComposeEnvironment, StartedDockerComposeEnvironment } from "testcontainers";
import { standaloneConfig } from "./standalone.js";

export class TestContainers {
  private readonly composeDir: string;
  private readonly composeFile: string;
  private readonly uid: string;
  env?: StartedDockerComposeEnvironment;
  logger: Logger;

  constructor(composeDir: string, composeFile: string, logger: Logger) {
    this.composeDir = composeDir;
    this.composeFile = composeFile;
    this.uid = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER).toString();

    this.logger = logger;
  }

  async start(): Promise<StartedDockerComposeEnvironment> {
    this.logger.info(`Starting test environment... path=${this.composeDir}, file=${this.composeFile}, uid=${this.uid}`);

    const config = standaloneConfig(this.composeDir, this.composeFile);
    this.env = await new DockerComposeEnvironment(this.composeDir, this.composeFile)
      .withWaitStrategy(`${config.container.proofServer.name}_${this.uid}`, config.container.proofServer.waitStrategy)
      .withWaitStrategy(`${config.container.node.name}_${this.uid}`, config.container.node.waitStrategy)
      .withWaitStrategy(`${config.container.indexer.name}_${this.uid}`, config.container.indexer.waitStrategy)
      .withEnvironment({
        TESTCONTAINERS_UID: this.uid,
        NETWORK_ID: "undeployed"
      })
      .up();

    return this.env;
  }

  async stop(): Promise<void> {
    if (this.env) {
      await this.env.down({ timeout: 10000, removeVolumes: true });
    }
  }

  getContainerName(containerName: "indexer" | "node" | "proof-server"): string {
    return `${containerName}_${this.uid}`;
  }

  getContainerPort(containerName: string, url: string): string {
    if (!this.env) throw new Error("Environment not started");

    const mappedUrl = new URL(url);
    const container = this.env.getContainer(containerName);
    mappedUrl.port = String(container.getFirstMappedPort())
    return mappedUrl.toString().replace(/\/+$/, '');
  }
}