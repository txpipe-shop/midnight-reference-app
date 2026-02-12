import type { TestContainers } from "@midnight-reference-app/containers";
import { exampleContractPrivateStateKey } from "@midnight-reference-app/contract";
import "dotenv/config";
import path from 'node:path';

export interface Config {
  readonly privateStateStoreName: string;
  readonly logDir: string;
  readonly zkConfigPath: string;
  readonly indexer: string;
  readonly indexerWS: string;
  readonly node: string;
  readonly proofServer: string;

  updateConfigURLs(testContainers: TestContainers): void;
}

export const currentDir = path.resolve(new URL(import.meta.url).pathname, '..');
// TODO: fix harcoded values
export class StandaloneConfig implements Config {
  privateStateStoreName = exampleContractPrivateStateKey;
  logDir = path.resolve(currentDir, '..', 'logs', 'standalone', `${new Date().toISOString()}.log`);
  zkConfigPath = path.resolve(currentDir, '..', '..', 'packages', 'contract', 'dist', 'managed', 'example');
  indexer = 'http://127.0.0.1:8088/api/v3/graphql';
  indexerWS = 'ws://127.0.0.1:8088/api/v3/graphql/ws';
  node = 'http://127.0.0.1:9944';
  proofServer = 'http://127.0.0.1:6300';

  updateConfigURLs(testContainers: TestContainers): void {
    this.indexer = testContainers.getContainerPort(testContainers.getContainerName('indexer'), this.indexer);
    this.indexerWS = testContainers.getContainerPort(testContainers.getContainerName('indexer'), this.indexerWS);
    this.node = testContainers.getContainerPort(testContainers.getContainerName('node'), this.node);
    this.proofServer = testContainers.getContainerPort(testContainers.getContainerName('proof-server'), this.proofServer);
  }
}

// TODO: validate env variables
export const env = {
  API_URL: process.env.API_URL || 'http://localhost:3000',
  COMPOSE_DIR: process.env.COMPOSE_DIR!,
  COMPOSE_FILE: process.env.COMPOSE_FILE!,
}