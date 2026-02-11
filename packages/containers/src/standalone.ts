import { Wait, WaitStrategy } from "testcontainers";

class DelayedWaitStrategy {
  delayMs;
  delegate;
  startupTimeoutMs = 60_000;
  startupTimeoutSet = false;
  constructor(delayMs: number, delegate: WaitStrategy) {
    this.delayMs = delayMs;
    this.delegate = delegate;
  }
  async waitUntilReady(...args: Parameters<WaitStrategy['waitUntilReady']>) {
    console.log(`[DelayedWaitStrategy] Starting ${this.delayMs}ms delay before health check...`);
    await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    console.log(`[DelayedWaitStrategy] Delay complete, now checking health...`);
    await this.delegate.waitUntilReady(...args);
    console.log(`[DelayedWaitStrategy] Health check passed`);
  }
  withStartupTimeout(startupTimeoutMs: number) {
    this.startupTimeoutMs = startupTimeoutMs;
    this.startupTimeoutSet = true;
    this.delegate.withStartupTimeout(startupTimeoutMs);
    return this;
  }
  isStartupTimeoutSet() {
    return this.startupTimeoutSet;
  }
  getStartupTimeout() {
    return this.startupTimeoutMs;
  }
}

const WaitStrategies = {
  forDelayedStrategy(delayMs: number, delegate: WaitStrategy) {
    return new DelayedWaitStrategy(delayMs, delegate);
  }
};

export const standaloneConfig = (currentWorkingDir: string, fileName: string) => ({
  path: currentWorkingDir,
  fileName: fileName,
  container: {
    proofServer: {
      name: 'proof-server',
      port: 6300,
      waitStrategy: Wait.forListeningPorts().withStartupTimeout(3 * 60_000)
    },
    node: {
      name: 'node',
      port: 9944,
      waitStrategy: WaitStrategies.forDelayedStrategy(20_000, Wait.forHealthCheck())
    },
    indexer: {
      name: 'indexer',
      port: 8088,
      waitStrategy: Wait.forListeningPorts()
    }
  }
})