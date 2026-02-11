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

}

export const currentDir = path.resolve(new URL(import.meta.url).pathname, '..');
export class StandaloneConfig implements Config {
  privateStateStoreName = exampleContractPrivateStateKey;
  logDir = path.resolve(currentDir, '..', 'logs', 'standalone', `${new Date().toISOString()}.log`);
  zkConfigPath = path.resolve(currentDir, '..', '..', 'packages', 'contract', 'dist', 'managed', 'example');
  indexer = 'http://127.0.0.1:8088/api/v1/graphql';
  indexerWS = 'ws://127.0.0.1:8088/api/v1/graphql/ws';
  node = 'http://127.0.0.1:9944';
  proofServer = 'http://127.0.0.1:6300';
}

// TODO: validate env variables
export const env = {
  API_URL: process.env.API_URL || 'http://localhost:3000',
  COMPOSE_DIR: process.env.COMPOSE_DIR!,
  COMPOSE_FILE: process.env.COMPOSE_FILE!,
}