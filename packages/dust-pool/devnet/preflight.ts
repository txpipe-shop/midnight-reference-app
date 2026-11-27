// Devnet preflight. Checks that the three ledger 9 services are reachable and
// that the pool contract has been compiled with full ZK artifacts, then prints
// the exact next steps. It does not submit anything.
//
//   pnpm --filter @midnight-sentinel/dust-pool devnet:preflight
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const managed = resolve(here, '../src/managed/pool');

const NODE = process.env.POOL_NODE ?? 'http://127.0.0.1:9944';
const INDEXER = process.env.POOL_INDEXER ?? 'http://127.0.0.1:8088';
const PROOF = process.env.POOL_PROOF_SERVER ?? 'http://127.0.0.1:6300';

const ping = async (label: string, url: string, path: string): Promise<boolean> => {
  try {
    const response = await fetch(`${url}${path}`);
    const ok = response.ok || response.status === 400; // some endpoints 400 a bare GET but are up
    console.log(`${ok ? 'ok  ' : 'DOWN'} ${label.padEnd(13)} ${url}`);
    return ok;
  } catch (error) {
    console.log(
      `DOWN ${label.padEnd(13)} ${url} (${error instanceof Error ? error.message : error})`
    );
    return false;
  }
};

const main = async () => {
  console.log('Pool devnet preflight\n');

  const services = (
    await Promise.all([
      ping('node', NODE, '/health'),
      ping('indexer', INDEXER, '/api/v3/graphql'),
      ping('proof-server', PROOF, '/health'),
    ])
  ).every(Boolean);

  // A --skip-zk build leaves `zkir/` but no `keys/`; only a full build can prove.
  const fullZk = existsSync(resolve(managed, 'keys'));
  console.log(
    `${fullZk ? 'ok  ' : 'TODO'} contract      ${
      fullZk ? 'ZK artifacts present' : 'compile with `pnpm compact` (full ZK) before deploying'
    }`
  );

  console.log('\nNext:');
  if (!services) {
    console.log(
      '  1. Start services: docker compose -f packages/dust-pool/compose.ledger9.yml up -d'
    );
    console.log('     (confirm the image tags in that file first)');
  }
  if (!fullZk) {
    console.log('  2. Build full-ZK artifacts: pnpm --filter @midnight-sentinel/dust-pool compact');
  }
  console.log('  3. Deploy and run the fill/audit flow (see README, "Running on a devnet").');
  process.exit(services && fullZk ? 0 : 1);
};

void main();
