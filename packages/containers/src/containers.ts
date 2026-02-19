import { Logger } from "pino";
import {
  DockerComposeEnvironment,
  StartedDockerComposeEnvironment,
} from "testcontainers";
import { standaloneConfig } from "./standalone.js";

export class TestContainers {
  private readonly composeDir: string;
  private readonly composeFile: string;
  private readonly uid: string;
  dockerEnv?: DockerComposeEnvironment | StartedDockerComposeEnvironment;
  logger: Logger;

  constructor(composeDir: string, composeFile: string, logger: Logger) {
    this.composeDir = composeDir;
    this.composeFile = composeFile;
    this.uid = "shared";

    this.logger = logger;

    const config = standaloneConfig(this.composeDir, this.composeFile);
    this.dockerEnv = new DockerComposeEnvironment(
      this.composeDir,
      this.composeFile,
    )
      .withWaitStrategy(
        `${config.container.proofServer.name}_${this.uid}`,
        config.container.proofServer.waitStrategy,
      )
      .withWaitStrategy(
        `${config.container.node.name}_${this.uid}`,
        config.container.node.waitStrategy,
      )
      .withWaitStrategy(
        `${config.container.indexer.name}_${this.uid}`,
        config.container.indexer.waitStrategy,
      )
      .withNoRecreate()
      .withProjectName("midnight-reference-app")
      .withEnvironment({
        TESTCONTAINERS_UID: this.uid,
        NETWORK_ID: "undeployed",
      });
  }

  async start(): Promise<StartedDockerComposeEnvironment> {
    if (!this.dockerEnv) throw new Error("Docker environment not initialized");
    if (this.dockerEnv instanceof StartedDockerComposeEnvironment)
      throw new Error("Docker environment already started");

    this.logger.info(
      `Starting test environment... path=${this.composeDir}, file=${this.composeFile}, uid=${this.uid}`,
    );
    this.dockerEnv = await this.dockerEnv.up();

    return this.dockerEnv;
  }

  async stop(): Promise<void> {
    if (this.dockerEnv instanceof DockerComposeEnvironment)
      return this.logger.info("Docker environment not started");
    if (this.dockerEnv) {
      await this.dockerEnv.down({ timeout: 10000, removeVolumes: true });
    }
  }

  getContainerName(containerName: "indexer" | "node" | "proof-server"): string {
    return `${containerName}_${this.uid}`;
  }

  getContainerPort(containerName: string, url: string): string {
    if (!this.dockerEnv) throw new Error("Docker environment not initialized");
    if (this.dockerEnv instanceof DockerComposeEnvironment)
      throw new Error("Docker environment not started");

    const mappedUrl = new URL(url);
    const container = this.dockerEnv.getContainer(containerName);
    mappedUrl.port = String(container.getFirstMappedPort());
    return mappedUrl.toString().replace(/\/+$/, "");
  }
}
