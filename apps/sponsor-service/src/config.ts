import { z } from 'zod';
import path from 'node:path';

const schema = z.object({
  SERVICE_HOST: z.string().default('127.0.0.1'),
  SERVICE_PORT: z.coerce.number().int().min(1).max(65_535).default(8089),
  SERVICE_DB_PATH: z.string().default('./sponsor-service.sqlite'),
  SERVICE_ADMIN_TOKEN: z.string().min(24),
  SERVICE_OPERATOR_SEED: z.string().regex(/^[0-9a-fA-F]{64}$/),
  SERVICE_OPERATOR_SECRET: z.string().regex(/^[0-9a-fA-F]{64}$/),
  SERVICE_PRIVATE_STATE_STORE: z.string().min(1).default('eligibility-operator'),
  SERVICE_REVALIDATE_MS: z.coerce.number().int().min(1_000).default(15_000),
  SERVICE_LOG_DIR: z.string().default('./logs/sponsor-service'),
  SERVICE_ZK_CONFIG_PATH: z.string().default('../../packages/contract/dist/managed/sentinel'),
  MIDNIGHT_NETWORK: z.string().default('undeployed'),
  MIDNIGHT_INDEXER_HTTP: z.string().url().default('http://127.0.0.1:8088/api/v4/graphql'),
  MIDNIGHT_INDEXER_WS: z.string().url().default('ws://127.0.0.1:8088/api/v4/graphql/ws'),
  MIDNIGHT_NODE: z.string().url().default('http://127.0.0.1:9944'),
  MIDNIGHT_PROOF_SERVER: z.string().url().default('http://127.0.0.1:6300'),
  SENTINEL_ADDRESS: z.string().regex(/^[0-9a-fA-F]{64}$/),
  SPONSOR_DUST_ADDRESS: z.string().min(1),
  EXPECTED_OPERATOR_AUTHORITY: z.string().regex(/^(0x)?[0-9a-fA-F]{64}$/),
});

export type ServiceConfig = ReturnType<typeof loadConfig>;

export const loadConfig = (environment: NodeJS.ProcessEnv = process.env) => {
  const value = schema.parse(environment);
  return {
    host: value.SERVICE_HOST,
    port: value.SERVICE_PORT,
    dbPath: value.SERVICE_DB_PATH,
    adminToken: value.SERVICE_ADMIN_TOKEN,
    operatorSeed: value.SERVICE_OPERATOR_SEED.toLowerCase(),
    operatorSecret: value.SERVICE_OPERATOR_SECRET.toLowerCase(),
    privateStateStoreName: value.SERVICE_PRIVATE_STATE_STORE,
    revalidateMs: value.SERVICE_REVALIDATE_MS,
    logDir: path.resolve(value.SERVICE_LOG_DIR),
    zkConfigPath: path.resolve(value.SERVICE_ZK_CONFIG_PATH),
    network: value.MIDNIGHT_NETWORK,
    networkId: value.MIDNIGHT_NETWORK,
    indexer: value.MIDNIGHT_INDEXER_HTTP,
    indexerWS: value.MIDNIGHT_INDEXER_WS,
    node: value.MIDNIGHT_NODE,
    proofServer: value.MIDNIGHT_PROOF_SERVER,
    sentinelAddress: value.SENTINEL_ADDRESS.toLowerCase(),
    sponsorDustAddress: value.SPONSOR_DUST_ADDRESS,
    expectedOperatorAuthority: value.EXPECTED_OPERATOR_AUTHORITY.replace(/^0x/, '').toLowerCase(),
  };
};
