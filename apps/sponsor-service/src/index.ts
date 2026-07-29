import { SentinelContract } from '@midnight-sentinel/api';
import { dustPublicKeyToBytes } from '@midnight-sentinel/api/sponsorship/midnight';
import { createMidnightEnrollmentVerifier } from '@midnight-sentinel/api/sponsorship/eligibility';
import {
  createPrivateState,
  deriveSentinelAuthority,
  sentinelContractPrivateStateKey,
} from '@midnight-sentinel/contract';
import { configureProviders } from '@midnight-sentinel/contract/providers';
import { buildWallet } from '@midnight-sentinel/wallet';
import { DustAddress, MidnightBech32m } from '@midnight-ntwrk/wallet-sdk-address-format';
import { loadConfig } from './config.js';
import { EligibilityDatabase } from './database.js';
import { MidnightIndexerScanner } from './indexer.js';
import { ContractQueueOperator } from './operator.js';
import { buildServer } from './server.js';
import { EligibilityService } from './service.js';
import { loadServiceEnv } from './load-env.js';

loadServiceEnv();
const equalHex = (bytes: Uint8Array, expected: string) =>
  Buffer.from(bytes).toString('hex') === expected.replace(/^0x/, '').toLowerCase();

const config = loadConfig();
const database = new EligibilityDatabase(config.dbPath);
const wallet = await buildWallet(config, config.operatorSeed);
const providers = await configureProviders(wallet, config, config.privateStateStoreName);
const operatorSecret = Uint8Array.from(Buffer.from(config.operatorSecret, 'hex'));
if (!equalHex(deriveSentinelAuthority(operatorSecret), config.expectedOperatorAuthority)) {
  throw new Error('Configured operator secret does not derive the expected operator authority');
}
providers.privateStateProvider.setContractAddress(config.sentinelAddress);
await providers.privateStateProvider.set(
  sentinelContractPrivateStateKey,
  createPrivateState(operatorSecret)
);
const contract = await SentinelContract.join(providers, config.sentinelAddress);
const campaignState = await contract.readState();

if (!equalHex(campaignState.eligibilityOperator, config.expectedOperatorAuthority)) {
  throw new Error('Configured eligibility operator does not match the Sentinel campaign');
}

const sponsorDustKey = DustAddress.codec.decode(
  config.network,
  MidnightBech32m.parse(config.sponsorDustAddress)
).data;
if (
  Buffer.from(campaignState.sponsorshipSponsorId).compare(
    Buffer.from(dustPublicKeyToBytes(sponsorDustKey))
  ) !== 0
) {
  throw new Error('Configured sponsor DUST address does not match the campaign');
}

const scanner = new MidnightIndexerScanner(
  config.indexer,
  config.indexerWS,
  database,
  sponsorDustKey.toString()
);
const service = new EligibilityService(
  database,
  scanner,
  new ContractQueueOperator(contract),
  {
    network: config.network,
    sentinelAddress: config.sentinelAddress,
    sponsorDustAddress: config.sponsorDustAddress,
    minimumRegisteredNight: campaignState.sponsorshipMinimumRegisteredNight,
  },
  createMidnightEnrollmentVerifier(config.network),
  config.revalidateMs
);
const server = buildServer(config, service);

service.start();
await server.listen({ host: config.host, port: config.port });

const shutdown = async () => {
  await service.stop();
  await server.close();
  await wallet.wallet.stop();
  database.close();
};

process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());
