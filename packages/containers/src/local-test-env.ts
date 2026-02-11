// import { NetworkId } from "@midnight-ntwrk/wallet-sdk-abstractions";
// import { Logger } from "pino";
// import { DockerComposeEnvironment, StartedDockerComposeEnvironment } from "testcontainers";
// import { standaloneConfig } from "./standalone.js";

// interface EnvironmentConfiguration {
//   walletNetworkId: string;
//   networkId: string;
//   indexer: string;
//   indexerWS: string;
//   node: string;
//   nodeWS: string;
//   faucet: string;
//   proofServer: string;
// }

// class LocalTestConfiguration {
//   walletNetworkId: string;
//   networkId: string;
//   indexer: string;
//   indexerWS: string;
//   node: string;
//   nodeWS: string;
//   proofServer: string;
//   faucet?: string;

//   constructor({ indexer, node, proofServer }: { indexer: number, node: number, proofServer: number }) {
//     this.walletNetworkId = NetworkId.NetworkId.Undeployed;
//     this.networkId = 'undeployed';
//     this.indexer = `http://127.0.0.1:${indexer}/api/v3/graphql`;
//     this.indexerWS = `ws://127.0.0.1:${indexer}/api/v3/graphql/ws`;
//     this.node = `http://127.0.0.1:${node}`;
//     this.nodeWS = `ws://127.0.0.1:${node}`;
//     this.proofServer = `http://127.0.0.1:${proofServer}`;
//     this.faucet = undefined;
//   }
// }

// export class LocalTestEnv {
//   static MAX_NUMBER_OF_WALLETS = 4;
//   genesisMintWalletSeed = [
//     '0000000000000000000000000000000000000000000000000000000000000002',
//     '0000000000000000000000000000000000000000000000000000000000000001',
//     '0000000000000000000000000000000000000000000000000000000000000003',
//     '0000000000000000000000000000000000000000000000000000000000000004'
//   ];

//   private logger: Logger;
//   private uid: string;
//   private config: ReturnType<typeof standaloneConfig>;
//   private environmentConfiguration?: LocalTestConfiguration;
//   private dockerEnv?: StartedDockerComposeEnvironment;
//   private walletProviders?: MidnightWalletProvider[];

//   constructor(logger: Logger, currentWorkingDir: string, fileName: string) {
//     this.logger = logger;
//     this.uid = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER).toString();
//     this.config = standaloneConfig(currentWorkingDir, fileName);
//   }

//   getEnvironmentConfiguration() {
//     return {
//       walletNetworkId: this.environmentConfiguration?.walletNetworkId,
//       networkId: this.environmentConfiguration?.networkId,
//       indexer: this.environmentConfiguration?.indexer,
//       indexerWS: this.environmentConfiguration?.indexerWS,
//       node: this.environmentConfiguration?.node,
//       nodeWS: this.environmentConfiguration?.nodeWS,
//       faucet: this.environmentConfiguration?.faucet,
//       proofServer: this.environmentConfiguration?.proofServer
//     };
//   }

//   getMappedPorts = () => {
//     if (!this.dockerEnv)
//       throw new Error('Docker environment not started');

//     return ({
//       indexer: this.dockerEnv.getContainer(`${this.config.container.indexer.name}_${this.uid}`)
//         .getMappedPort(this.config.container.indexer.port),
//       node: this.dockerEnv.getContainer(`${this.config.container.node.name}_${this.uid}`)
//         .getMappedPort(this.config.container.node.port),
//       proofServer: this.dockerEnv.getContainer(`${this.config.container.proofServer.name}_${this.uid}`)
//         .getMappedPort(this.config.container.proofServer.port)
//     });
//   }

//   startWithInjectedEnvironment = async (dockerEnv: StartedDockerComposeEnvironment, ports: { indexer: number, node: number, proofServer: number }) => {
//     this.logger.info(`Starting test environment...`);
//     this.dockerEnv = dockerEnv;
//     this.environmentConfiguration = new LocalTestConfiguration(ports);
//     this.logger.info(`Test environment configuration: ${JSON.stringify(this.environmentConfiguration)}`);
//     return this.environmentConfiguration;
//   }

//   start = async () => {
//     this.logger.info(`Starting test environment... path=${this.config.path}, file=${this.config.fileName}, uid=${this.uid}`);

//     this.dockerEnv = await new DockerComposeEnvironment(this.config.path, this.config.fileName)
//       .withWaitStrategy(`${this.config.container.proofServer.name}_${this.uid}`, this.config.container.proofServer.waitStrategy)
//       .withWaitStrategy(`${this.config.container.node.name}_${this.uid}`, this.config.container.node.waitStrategy)
//       .withWaitStrategy(`${this.config.container.indexer.name}_${this.uid}`, this.config.container.indexer.waitStrategy)
//       .withEnvironment({
//         TESTCONTAINERS_UID: this.uid,
//         NETWORK_ID: "undeployed"
//       })
//       .up();
//     this.environmentConfiguration = new LocalTestConfiguration(this.getMappedPorts());
//     this.logger.info(`Test environment configuration: ${JSON.stringify(this.environmentConfiguration)}`);
//     return this.environmentConfiguration;
//   };

//   shutdown = async (saveWalletState: boolean) => {
//     this.logger.info(`Shutting down test environment...`);
//     if (this.walletProviders) {
//       if (saveWalletState) {
//         this.logger.warn('Skipping wallet save state as it is obsolete in this context...');
//       }
//       await Promise.all(this.walletProviders.map((wallet) => wallet.stop()));
//     }
//     if (this.dockerEnv) {
//       await this.dockerEnv.down({ timeout: 10000, removeVolumes: true });
//     }
//   }

//   startMidnightWalletProviders = async (amount = 1, seeds = getEnvVarWalletSeeds()) => {
//     this.logger.info(`Getting ${amount} wallets...`);
//     if (seeds) {
//       this.logger.warn('Provided seeds will be ignored, using genesis mint wallet seeds');
//     }
//     if (amount > LocalTestEnv.MAX_NUMBER_OF_WALLETS) {
//       throw new Error(`Maximum supported number of wallets for this environment reached: ${LocalTestEnv.MAX_NUMBER_OF_WALLETS}`);
//     }
//     this.walletProviders = await Promise.all(Array.from({ length: amount }).map((_elem, index) => MidnightWalletProvider.build(this.logger, this.environmentConfiguration, this.genesisMintWalletSeed[index])));
//     await Promise.all(this.walletProviders.map((wallet) => wallet.start()));
//     return this.walletProviders;
//   };
// }