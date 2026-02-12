import { type Logger } from "pino";
import { StartedDockerComposeEnvironment } from "testcontainers";
import { type Config } from "../config.js";

export async function runCli(config: Config, testContainers: StartedDockerComposeEnvironment, logger: Logger): Promise<void> {
  console.log("Hello CLI");
}