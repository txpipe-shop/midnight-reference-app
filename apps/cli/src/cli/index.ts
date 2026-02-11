import type { TestContainers } from "@midnight-reference-app/containers";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import { type Logger } from "pino";
import { type Config } from "../config.js";
import { GENESIS_MINT_WALLET_SEED } from "../utils/constants.js";

export async function runCli(config: Config, testContainers: TestContainers, logger: Logger): Promise<void> {
  const rli = createInterface({ input, output, terminal: true });

  const wallet = await buildWalletAndWaitForFunds(config, logger, GENESIS_MINT_WALLET_SEED);
  // const providersToBeStopped: MidnightWalletProvider[] = [];

  // try {
  //   const envConfiguration = await testEnv.start();
  //   const seed = GENESIS_MINT_WALLET_SEED;
  //   console.log('seed', seed);

  //   const walletProvider = await MidnightWalletProvider.build(logger, envConfiguration, seed);
  //   providersToBeStopped.push(walletProvider);
  //   const walletFacade: WalletFacade = walletProvider.wallet;

  //   await walletProvider.start();

  //   const unshieldedState = await waitForUnshieldedFunds(
  //     logger,
  //     walletFacade,
  //     envConfiguration,
  //     unshieldedToken(),
  //     config.requestFaucetTokens,
  //   );
  //   const nightBalance = unshieldedState.balances[unshieldedToken().raw];
  //   if (nightBalance === undefined) {
  //     logger.info('No funds received, exiting...');
  //     return;
  //   }
  //   logger.info(`Your NIGHT wallet balance is: ${nightBalance}`);

  //   if (config.generateDust) {
  //     const dustGeneration = await generateDust(logger, seed, unshieldedState, walletFacade);
  //     if (dustGeneration) {
  //       logger.info(`Submitted dust generation registration transaction: ${dustGeneration}`);
  //       await syncWallet(logger, walletFacade);
  //     }
  //   }

  //   const zkConfigProvider = new NodeZkConfigProvider<never>(config.zkConfigPath);
  //   const providers: ExampleContractProviders = {
  //     privateStateProvider: levelPrivateStateProvider<PrivateStateId, PrivateState>({
  //       privateStateStoreName: config.privateStateStoreName,
  //       signingKeyStoreName: `${config.privateStateStoreName}-signing-keys`,
  //       privateStoragePasswordProvider: () => {
  //         return 'key-just-for-testing-here!';
  //       },
  //     }),
  //     publicDataProvider: indexerPublicDataProvider(envConfiguration.indexer, envConfiguration.indexerWS),
  //     zkConfigProvider: zkConfigProvider,
  //     proofProvider: httpClientProofProvider(envConfiguration.proofServer, zkConfigProvider),
  //     walletProvider: walletProvider,
  //     midnightProvider: walletProvider,
  //   };
  // } catch (e) {
  //   logError(logger, e);
  //   logger.info('Exiting...');
  // } finally {
  //   try {
  //     rli.close();
  //     rli.removeAllListeners();
  //   } catch (e) {
  //     logError(logger, e);
  //   } finally {
  //     try {
  //       for (const wallet of providersToBeStopped) {
  //         logger.info('Stopping wallet...');
  //         await wallet.stop();
  //       }
  //       if (testEnv) {
  //         logger.info('Stopping test environment...');
  //         await testEnv.shutdown();
  //       }
  //     } catch (e) {
  //       logError(logger, e);
  //     }
  //   }
  // }
}

function logError(logger: Logger, e: unknown) {
  if (e instanceof Error) {
    logger.error(`Found error '${e.message}'`);
    logger.debug(`${e.stack}`);
  } else {
    logger.error(`Found error (unknown type)`);
  }
}