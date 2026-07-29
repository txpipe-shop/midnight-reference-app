import { DatabaseSync } from 'node:sqlite';
import type {
  DustGenerationStatus,
  SignedEnrollment,
} from '@midnight-sentinel/api/sponsorship/eligibility';

export type JobStatus = 'pending' | 'scanning' | 'submitting' | 'active' | 'ineligible' | 'failed';

export interface StoredEnrollment {
  identity: string;
  address: string;
  verificationKey: string;
  payload: SignedEnrollment;
  nonce: bigint;
  status: JobStatus | 'unknown';
}

export interface StoredJob {
  id: string;
  identity: string;
  status: JobStatus;
  errorCode?: string;
  errorMessage?: string;
}

type SqlRow = Record<string, string | number | bigint | null>;

export class EligibilityDatabase {
  readonly sqlite: DatabaseSync;

  constructor(path: string) {
    this.sqlite = new DatabaseSync(path);
    this.sqlite.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    this.migrate();
  }

  private migrate() {
    const version = (
      this.sqlite.prepare('PRAGMA user_version').get() as {
        user_version: number;
      }
    ).user_version;
    if (version > 1) {
      throw new Error(`Unsupported eligibility database version ${version}`);
    }
    if (version === 1) return;
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS enrollments (
        identity TEXT PRIMARY KEY,
        address TEXT NOT NULL UNIQUE,
        verification_key TEXT NOT NULL,
        signed_enrollment TEXT NOT NULL,
        highest_nonce TEXT NOT NULL,
        status TEXT NOT NULL,
        reason TEXT,
        night_balance TEXT NOT NULL DEFAULT '0',
        finalized_block TEXT NOT NULL DEFAULT '0',
        synchronized INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        identity TEXT NOT NULL,
        status TEXT NOT NULL,
        error_code TEXT,
        error_message TEXT,
        attempts INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(identity) REFERENCES enrollments(identity)
      );
      CREATE TABLE IF NOT EXISTS utxos (
        address TEXT NOT NULL,
        utxo_key TEXT NOT NULL,
        token_type TEXT NOT NULL,
        value TEXT NOT NULL,
        registered INTEGER NOT NULL,
        dust_key TEXT,
        PRIMARY KEY(address, utxo_key)
      );
      CREATE TABLE IF NOT EXISTS cursors (
        address TEXT PRIMARY KEY,
        transaction_id INTEGER NOT NULL,
        finalized_block TEXT NOT NULL,
        synchronized INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      PRAGMA user_version = 1;
    `);
  }

  close() {
    this.sqlite.close();
  }

  transaction<T>(action: () => T): T {
    this.sqlite.exec('BEGIN IMMEDIATE');
    try {
      const result = action();
      this.sqlite.exec('COMMIT');
      return result;
    } catch (error) {
      this.sqlite.exec('ROLLBACK');
      throw error;
    }
  }

  putEnrollment(identity: string, enrollment: SignedEnrollment, nonce: bigint) {
    const current = this.getEnrollment(identity);
    if (current && nonce <= current.nonce) {
      throw new Error('ENROLLMENT_REPLAYED');
    }
    const now = new Date().toISOString();
    this.sqlite
      .prepare(
        `INSERT INTO enrollments (
          identity, address, verification_key, signed_enrollment, highest_nonce,
          status, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'pending', ?)
        ON CONFLICT(identity) DO UPDATE SET
          address = excluded.address,
          verification_key = excluded.verification_key,
          signed_enrollment = excluded.signed_enrollment,
          highest_nonce = excluded.highest_nonce,
          status = 'pending',
          reason = NULL,
          synchronized = 0,
          updated_at = excluded.updated_at`
      )
      .run(
        identity,
        enrollment.payload.nightRewardAddress,
        enrollment.payload.nightVerificationKey,
        JSON.stringify(enrollment),
        nonce.toString(),
        now
      );
  }

  getEnrollment(identity: string): StoredEnrollment | undefined {
    const row = this.sqlite
      .prepare('SELECT * FROM enrollments WHERE identity = ?')
      .get(identity) as SqlRow | undefined;
    return row ? this.mapEnrollment(row) : undefined;
  }

  getEnrollmentByAddress(address: string): StoredEnrollment | undefined {
    const row = this.sqlite.prepare('SELECT * FROM enrollments WHERE address = ?').get(address) as
      | SqlRow
      | undefined;
    return row ? this.mapEnrollment(row) : undefined;
  }

  listEnrollments(): StoredEnrollment[] {
    return (this.sqlite.prepare('SELECT * FROM enrollments').all() as SqlRow[]).map((row) =>
      this.mapEnrollment(row)
    );
  }

  private mapEnrollment(row: SqlRow): StoredEnrollment {
    return {
      identity: String(row.identity),
      address: String(row.address),
      verificationKey: String(row.verification_key),
      payload: JSON.parse(String(row.signed_enrollment)) as SignedEnrollment,
      nonce: BigInt(String(row.highest_nonce)),
      status: String(row.status) as StoredEnrollment['status'],
    };
  }

  createJob(id: string, identity: string) {
    const now = new Date().toISOString();
    this.sqlite
      .prepare(
        `INSERT INTO jobs (
          id, identity, status, created_at, updated_at
        ) VALUES (?, ?, 'pending', ?, ?)`
      )
      .run(id, identity, now, now);
  }

  getJob(id: string): StoredJob | undefined {
    const row = this.sqlite.prepare('SELECT * FROM jobs WHERE id = ?').get(id) as
      | SqlRow
      | undefined;
    if (!row) return undefined;
    return {
      id: String(row.id),
      identity: String(row.identity),
      status: String(row.status) as JobStatus,
      errorCode: row.error_code ? String(row.error_code) : undefined,
      errorMessage: row.error_message ? String(row.error_message) : undefined,
    };
  }

  listUnfinishedJobs(): StoredJob[] {
    return (
      this.sqlite
        .prepare(
          `SELECT * FROM jobs WHERE status IN (
            'pending', 'scanning', 'submitting'
          ) ORDER BY created_at`
        )
        .all() as SqlRow[]
    ).map((row) => ({
      id: String(row.id),
      identity: String(row.identity),
      status: String(row.status) as JobStatus,
      errorCode: row.error_code ? String(row.error_code) : undefined,
      errorMessage: row.error_message ? String(row.error_message) : undefined,
    }));
  }

  setJobStatus(id: string, status: JobStatus, errorCode?: string, errorMessage?: string) {
    this.sqlite
      .prepare(
        `UPDATE jobs SET status = ?, error_code = ?, error_message = ?,
          updated_at = ? WHERE id = ?`
      )
      .run(status, errorCode ?? null, errorMessage ?? null, new Date().toISOString(), id);
  }

  incrementJobAttempts(id: string): number {
    this.sqlite
      .prepare(
        `UPDATE jobs SET attempts = attempts + 1, status = 'pending',
          updated_at = ? WHERE id = ?`
      )
      .run(new Date().toISOString(), id);
    const row = this.sqlite.prepare('SELECT attempts FROM jobs WHERE id = ?').get(id) as
      | SqlRow
      | undefined;
    return Number(row?.attempts ?? 0);
  }

  setEnrollmentStatus(
    identity: string,
    status: StoredEnrollment['status'],
    result?: DustGenerationStatus,
    reason?: string
  ) {
    this.sqlite
      .prepare(
        `UPDATE enrollments SET status = ?, reason = ?, night_balance = ?,
          finalized_block = ?, synchronized = ?, updated_at = ? WHERE identity = ?`
      )
      .run(
        status,
        reason ?? null,
        result?.nightBalance.toString() ?? '0',
        result?.finalizedBlock.toString() ?? '0',
        result?.synchronized ? 1 : 0,
        new Date().toISOString(),
        identity
      );
  }

  getStatus(address: string): DustGenerationStatus | undefined {
    const row = this.sqlite
      .prepare(
        `SELECT address, night_balance, finalized_block, synchronized, status
         FROM enrollments WHERE address = ?`
      )
      .get(address) as SqlRow | undefined;
    if (!row) return undefined;
    const registered = String(row.status) === 'active';
    return {
      nightRewardAddress: String(row.address),
      registered,
      nightBalance: BigInt(String(row.night_balance)),
      finalizedBlock: BigInt(String(row.finalized_block)),
      synchronized: Number(row.synchronized) === 1,
    };
  }

  getCursor(address: string) {
    const row = this.sqlite.prepare('SELECT * FROM cursors WHERE address = ?').get(address) as
      | SqlRow
      | undefined;
    return row
      ? {
          transactionId: Number(row.transaction_id),
          finalizedBlock: BigInt(String(row.finalized_block)),
          synchronized: Number(row.synchronized) === 1,
        }
      : undefined;
  }

  setCursor(address: string, transactionId: number, finalizedBlock: bigint) {
    this.sqlite
      .prepare(
        `INSERT INTO cursors (
          address, transaction_id, finalized_block, synchronized
        ) VALUES (?, ?, ?, 1)
        ON CONFLICT(address) DO UPDATE SET
          transaction_id = excluded.transaction_id,
          finalized_block = excluded.finalized_block,
          synchronized = 1`
      )
      .run(address, transactionId, finalizedBlock.toString());
  }

  markCursorUnsynchronized(address: string) {
    this.sqlite
      .prepare(
        `INSERT INTO cursors (
          address, transaction_id, finalized_block, synchronized
        ) VALUES (?, 0, '0', 0)
        ON CONFLICT(address) DO UPDATE SET synchronized = 0`
      )
      .run(address);
  }

  applyUtxoChanges(
    address: string,
    spentKeys: readonly string[],
    created: readonly {
      key: string;
      tokenType: string;
      value: bigint;
      registered: boolean;
      dustKey?: string;
    }[]
  ) {
    const remove = this.sqlite.prepare('DELETE FROM utxos WHERE address = ? AND utxo_key = ?');
    for (const key of spentKeys) remove.run(address, key);
    const insert = this.sqlite.prepare(
      `INSERT OR REPLACE INTO utxos (
        address, utxo_key, token_type, value, registered, dust_key
      ) VALUES (?, ?, ?, ?, ?, ?)`
    );
    for (const utxo of created) {
      insert.run(
        address,
        utxo.key,
        utxo.tokenType,
        utxo.value.toString(),
        utxo.registered ? 1 : 0,
        utxo.dustKey ?? null
      );
    }
  }

  qualifyingBalance(address: string, tokenType: string, dustKey: string): bigint {
    const rows = this.sqlite
      .prepare(
        `SELECT value FROM utxos WHERE address = ? AND token_type = ?
          AND registered = 1 AND dust_key = ?`
      )
      .all(address, tokenType, dustKey) as SqlRow[];
    return rows.reduce((total, row) => total + BigInt(String(row.value)), 0n);
  }

  getMetadata(key: string): string | undefined {
    const row = this.sqlite.prepare('SELECT value FROM metadata WHERE key = ?').get(key) as
      | SqlRow
      | undefined;
    return row ? String(row.value) : undefined;
  }

  setMetadata(key: string, value: string) {
    this.sqlite
      .prepare(
        `INSERT INTO metadata (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      )
      .run(key, value);
  }
}
