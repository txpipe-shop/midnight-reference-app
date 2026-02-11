// export class MidnightWalletProvider {
//   logger;
//   env;
//   wallet;
//   unshieldedKeystore;
//   zswapSecretKeys;
//   dustSecretKey;
//   constructor(logger: Logger, environmentConfiguration: LocalTestConfiguration, wallet: Wallet, zswapSecretKeys: ZswapSecretKeys, dustSecretKey: DustSecretKey, unshieldedKeystore: UnshieldedKeystore) {
//     this.logger = logger;
//     this.env = environmentConfiguration;
//     this.wallet = wallet;
//     this.zswapSecretKeys = zswapSecretKeys;
//     this.dustSecretKey = dustSecretKey;
//     this.unshieldedKeystore = unshieldedKeystore;
//   }
//   getCoinPublicKey() {
//     return this.zswapSecretKeys.coinPublicKey;
//   }
//   getEncryptionPublicKey() {
//     return this.zswapSecretKeys.encryptionPublicKey;
//   }
//   async balanceTx(tx, ttl = midnightJsUtils.ttlOneHour()) {
//     const bound = tx.bind();
//     const finalizedTransactionRecipe = await this.wallet.balanceFinalizedTransaction(bound, { shieldedSecretKeys: this.zswapSecretKeys, dustSecretKey: this.dustSecretKey }, { ttl });
//     const signed = await this.wallet.signRecipe(finalizedTransactionRecipe, (payload) => this.unshieldedKeystore.signData(payload));
//     return this.wallet.finalizeRecipe(signed);
//   }
//   submitTx(tx) {
//     return this.wallet.submitTransaction(tx);
//   }
//   async start(waitForFundsInWallet = true, tokenType = ledgerV7.shieldedToken()) {
//     this.logger.info('Starting wallet...');
//     await this.wallet.start(this.zswapSecretKeys, this.dustSecretKey);
//     if (waitForFundsInWallet) {
//       const balance = await waitForFunds(this.wallet, this.env, tokenType, true);
//       this.logger.info(`Your wallet balance is: ${JSON.stringify(balance)}`);
//     }
//   }
//   async stop() {
//     return this.wallet.stop();
//   }
//   static async build(logger, env, seed) {
//     const builder = FluentWalletBuilder.forEnvironment(env);
//     const { wallet, seeds, keystore } = seed
//       ? await builder.withSeed(seed).buildWithoutStarting()
//       : await builder.withRandomSeed().buildWithoutStarting();
//     const initialState = await getInitialShieldedState(wallet.shielded);
//     logger.info(`Your wallet seed is: ${seeds.masterSeed} and your address is: ${initialState.address.coinPublicKeyString()}`);
//     return new MidnightWalletProvider(logger, env, wallet, ledgerV7.ZswapSecretKeys.fromSeed(seeds.shielded), ledgerV7.DustSecretKey.fromSeed(seeds.dust), keystore);
//   }
//   static async withWallet(logger, env, wallet, zswapSecretKeys, dustSecretKey, unshieldedKeystore) {
//     return new MidnightWalletProvider(logger, env, wallet, zswapSecretKeys, dustSecretKey, unshieldedKeystore);
//   }
// }