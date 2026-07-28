import assert from 'node:assert/strict';
import test from 'node:test';
import { renderDevnetEnvironment } from '../src/setup-devnet-config.js';

test('renders every generated service identity and campaign value', () => {
  const rendered = renderDevnetEnvironment({
    adminToken: 'a'.repeat(64),
    operatorSeed: '1'.repeat(64),
    operatorSecret: '2'.repeat(64),
    operatorAuthority: '3'.repeat(64),
    sentinelAddress: '4'.repeat(64),
    sponsorDustAddress: 'dust_undeployed1example',
  });

  assert.match(rendered, /SERVICE_ADMIN_TOKEN=a{64}/);
  assert.match(rendered, /SERVICE_OPERATOR_SEED=1{64}/);
  assert.match(rendered, /SERVICE_OPERATOR_SECRET=2{64}/);
  assert.match(rendered, /EXPECTED_OPERATOR_AUTHORITY=3{64}/);
  assert.match(rendered, /SENTINEL_ADDRESS=4{64}/);
  assert.match(rendered, /SPONSOR_DUST_ADDRESS=dust_undeployed1example/);
});
