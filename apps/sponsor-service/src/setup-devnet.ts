import { randomBytes } from 'node:crypto';
import { access, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deployContract } from '@midnight-ntwrk/midnight-js-contracts';
import { SentinelContract } from '@midnight-sentinel/api';
import { nativeNightSponsorshipConfig } from '@midnight-sentinel/api/sponsorship/midnight';
import { sponsorshipAllowlistHash } from '@midnight-sentinel/api/sponsorship';
import { deriveSentinelAuthority } from '@midnight-sentinel/contract';
import { configureProviders } from '@midnight-sentinel/contract/providers';
import {
  CompositeTargetCompiledContract,
  type CompositeTargetContractType,
} from '@midnight-sentinel/contract/verification/composite-sponsorship';
import {
  buildWallet,
  getBalancesAndAddresses,
  type WalletContext,
} from '@midnight-sentinel/wallet';
import { renderDevnetEnvironment } from './setup-devnet-config.js';

const GENESIS_DEPLOYER_SEED = `${'0'.repeat(63)}1`;
const GENESIS_OPERATOR_SEED = `${'0'.repeat(63)}2`;
const GENESIS_SPONSOR_SEED = `${'0'.repeat(63)}3`;

const packageDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryDirectory = path.resolve(packageDirectory, '../..');
const sentinelZkPath = path.join(repositoryDirectory, 'packages/contract/dist/managed/sentinel');
const targetZkPath = path.join(
  repositoryDirectory,
  'packages/contract/dist/managed/composite-target'
);
const envPath = path.join(packageDirectory, '.env');
const replaceEnvironment = process.argv.includes('--force');

const network = {
  networkId: 'undeployed',
  indexer: 'http://127.0.0.1:8088/api/v4/graphql',
  indexerWS: 'ws://127.0.0.1:8088/api/v4/graphql/ws',
  node: 'http://127.0.0.1:9944',
  proofServer: 'http://127.0.0.1:6300',
  privateStateStoreName: 'setup',
  logDir: path.join(packageDirectory, 'logs/setup'),
  zkConfigPath: sentinelZkPath,
  eligibilityService: 'http://127.0.0.1:8089',
};

const requireArtifacts = async () => {
  try {
    await Promise.all([
      access(path.join(sentinelZkPath, 'keys/purchaseSponsorship.prover')),
      access(path.join(targetZkPath, 'keys/interact.prover')),
    ]);
  } catch {
    throw new Error(
      'Full-ZK artifacts are missing. Build the Sentinel and composite target before setup.'
    );
  }
};

const requireWritableEnvironment = async () => {
  if (replaceEnvironment) return;
  try {
    await access(envPath);
  } catch {
    return;
  }
  throw new Error(`Refusing to replace ${envPath}. Re-run with --force to replace it.`);
};

const hex = (value: Uint8Array) => Buffer.from(value).toString('hex');

const stopWallets = async (wallets: WalletContext[]) => {
  await Promise.allSettled(wallets.map(({ wallet }) => wallet.stop()));
};

const main = async () => {
  await requireArtifacts();
  await requireWritableEnvironment();
  const wallets: WalletContext[] = [];
  try {
    console.log('Connecting funded local-devnet wallets...');
    const [deployer, sponsor] = await Promise.all([
      buildWallet(network, GENESIS_DEPLOYER_SEED),
      buildWallet(network, GENESIS_SPONSOR_SEED),
    ]);
    wallets.push(deployer, sponsor);

    console.log('Deploying sponsorship target...');
    const targetProviders = await configureProviders(
      deployer,
      network,
      `setup-target-${Date.now()}`,
      targetZkPath
    );
    const target = await deployContract<CompositeTargetContractType>(
      targetProviders as never,
      { compiledContract: CompositeTargetCompiledContract } as never
    );
    const targetAddress = target.deployTxData.public.contractAddress;
    const targetEntryPoint = 'interact';

    const operatorSecret = Uint8Array.from(randomBytes(32));
    const operatorAuthority = deriveSentinelAuthority(operatorSecret);
    const policyHash = sponsorshipAllowlistHash([
      { address: targetAddress, entryPoint: targetEntryPoint },
    ]);

    console.log('Deploying Sentinel campaign...');
    const sentinelProviders = await configureProviders(
      deployer,
      network,
      `setup-sentinel-${Date.now()}`,
      sentinelZkPath
    );
    const sentinel = await SentinelContract.deploy(
      sentinelProviders,
      nativeNightSponsorshipConfig(sponsor, policyHash, {
        sponsorShare: 1n,
        delegatorShare: 1n,
        minimumRegisteredNight: 1n,
        initialEligibilityOperator: operatorAuthority,
      })
    );
    const sentinelAddress = sentinel.deployedContract!.deployTxData.public.contractAddress;
    const { addresses } = await getBalancesAndAddresses(sponsor.wallet, GENESIS_SPONSOR_SEED);

    await writeFile(
      envPath,
      renderDevnetEnvironment({
        adminToken: randomBytes(32).toString('hex'),
        operatorSeed: GENESIS_OPERATOR_SEED,
        operatorSecret: hex(operatorSecret),
        operatorAuthority: hex(operatorAuthority),
        sentinelAddress,
        sponsorDustAddress: addresses.dust,
      }),
      { mode: 0o600 }
    );

    console.log(
      JSON.stringify({
        setup: 'confirmed',
        envFile: envPath,
        sentinelAddress,
        sponsorDustAddress: addresses.dust,
        target: { address: targetAddress, entryPoint: targetEntryPoint },
        fixedPrice: '2',
        sponsorShare: '1',
        delegatorShare: '1',
        next: 'pnpm --filter @midnight-sentinel/sponsor-service dev',
      })
    );
  } finally {
    await stopWallets(wallets);
  }
};

await main();
