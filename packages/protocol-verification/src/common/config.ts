import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export const standaloneConfig = {
  networkId: 'undeployed',
  privateStateStoreName: 'protocol-verification',
  logDir: path.join(packageDirectory, 'logs'),
  zkConfigPath: path.join(packageDirectory, 'src/managed/sentinel'),
  indexer: 'http://127.0.0.1:8088/api/v4/graphql',
  indexerWS: 'ws://127.0.0.1:8088/api/v4/graphql/ws',
  node: 'http://127.0.0.1:9944',
  proofServer: 'http://127.0.0.1:6300',
  eligibilityService: 'http://127.0.0.1:8089',
};

export const packagePath = (...parts: string[]) => path.join(packageDirectory, ...parts);
