import assert from 'node:assert/strict';
import { test } from 'node:test';
import { audit, requiredUnits } from '../src/auditor.js';

const STARS_PER_DUST = 200_000n; // 0.2 NIGHT per DUST

test('a pool where every spend is a settle at the floor passes', () => {
  const settled = [
    {
      nullifier: 1n,
      fee: 600_000_000_000_000n,
      units: requiredUnits(600_000_000_000_000n, STARS_PER_DUST),
    },
    {
      nullifier: 2n,
      fee: 500_000_000_000_000n,
      units: requiredUnits(500_000_000_000_000n, STARS_PER_DUST) + 5n,
    },
  ];
  const observed = [
    { nullifier: 1n, vFee: 600_000_000_000_000n },
    { nullifier: 2n, vFee: 500_000_000_000_000n },
  ];
  const report = audit({ settled, observed, starsPerDust: STARS_PER_DUST });
  assert.equal(report.ok, true);
  assert.deepEqual(report.diversions, []);
  assert.deepEqual(report.underpayments, []);
  assert.deepEqual(report.unobserved, []);
});

test('a spend under the pool key with no matching settle is flagged as a diversion', () => {
  const settled = [
    {
      nullifier: 1n,
      fee: 600_000_000_000_000n,
      units: requiredUnits(600_000_000_000_000n, STARS_PER_DUST),
    },
  ];
  const observed = [
    { nullifier: 1n, vFee: 600_000_000_000_000n },
    { nullifier: 99n, vFee: 800_000_000_000_000n }, // operator paid its own fee from pooled DUST
  ];
  const report = audit({ settled, observed, starsPerDust: STARS_PER_DUST });
  assert.equal(report.ok, false);
  assert.deepEqual(report.diversions, [{ nullifier: 99n, vFee: 800_000_000_000_000n }]);
});

test('a settle recorded below the floor is flagged', () => {
  const fee = 600_000_000_000_000n;
  const settled = [{ nullifier: 1n, fee, units: requiredUnits(fee, STARS_PER_DUST) - 1n }];
  const observed = [{ nullifier: 1n, vFee: fee }];
  const report = audit({ settled, observed, starsPerDust: STARS_PER_DUST });
  assert.equal(report.ok, false);
  assert.equal(report.underpayments.length, 1);
  assert.equal(report.underpayments[0].nullifier, 1n);
});

test('a settled note not yet seen on chain is reported but not a failure', () => {
  const settled = [{ nullifier: 7n, fee: 100n, units: requiredUnits(100n, STARS_PER_DUST) }];
  const report = audit({ settled, observed: [], starsPerDust: STARS_PER_DUST });
  assert.equal(report.ok, true);
  assert.deepEqual(report.unobserved, [7n]);
});
