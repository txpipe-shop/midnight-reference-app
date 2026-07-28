import { randomUUID } from 'node:crypto';
import {
  assertEligible,
  EligibilityError,
  enrollDelegator,
  verifyEnrollment,
  type EligibilityCampaign,
  type EnrollmentSignatureVerifier,
  type SignedEnrollment,
} from '@midnight-sentinel/api/sponsorship/eligibility';
import { EligibilityDatabase } from './database.js';
import { MidnightIndexerScanner } from './indexer.js';
import { ContractQueueOperator } from './operator.js';

const identityHex = (value: Uint8Array) => Buffer.from(value).toString('hex');
const identityBytes = (value: string) =>
  Uint8Array.from(Buffer.from(value.replace(/^0x/, ''), 'hex'));

export class EligibilityService {
  private mutationTail: Promise<void> = Promise.resolve();
  private timer?: NodeJS.Timeout;
  private readonly background = new Set<Promise<void>>();
  private readonly retryTimers = new Set<NodeJS.Timeout>();
  private revalidationInFlight = false;
  private running = false;

  constructor(
    readonly database: EligibilityDatabase,
    private readonly scanner: MidnightIndexerScanner,
    private readonly operator: ContractQueueOperator,
    private readonly campaign: EligibilityCampaign,
    private readonly verifier: EnrollmentSignatureVerifier,
    private readonly revalidateMs: number
  ) {}

  start() {
    if (this.running) return;
    this.running = true;
    this.timer = setInterval(() => {
      this.runBackground(this.revalidateIfBlockAdvanced());
    }, this.revalidateMs);
    this.timer.unref();
    for (const job of this.database.listUnfinishedJobs()) {
      this.serialize(async () => this.process(job.id, job.identity));
    }
    this.runBackground(this.revalidateIfBlockAdvanced());
  }

  async stop() {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    for (const retry of this.retryTimers) clearTimeout(retry);
    this.retryTimers.clear();
    await Promise.allSettled([...this.background]);
    await this.mutationTail.catch(() => undefined);
    await this.scanner.dispose();
  }

  submit(enrollment: SignedEnrollment) {
    const verified = this.verify(enrollment);
    const identity = identityHex(verified.identity);
    const jobId = randomUUID();
    this.database.transaction(() => {
      this.database.putEnrollment(identity, enrollment, verified.nonce);
      this.database.createJob(jobId, identity);
    });
    this.serialize(async () => this.process(jobId, identity));
    return { jobId, identity };
  }

  getJob(id: string) {
    return this.database.getJob(id);
  }

  getStatus(address: string) {
    const status = this.database.getStatus(address);
    return status && status.registered
      ? { ...status, dustAddress: this.campaign.sponsorDustAddress }
      : status;
  }

  private verify(enrollment: SignedEnrollment) {
    // Use the shared canonical verifier without duplicating its rules.
    return verifyEnrollment(enrollment, this.campaign, this.verifier);
  }

  private serialize(action: () => Promise<void>) {
    this.mutationTail = this.mutationTail.then(action, action);
    return this.mutationTail;
  }

  private async process(jobId: string, identity: string) {
    const enrollment = this.database.getEnrollment(identity);
    if (!enrollment) return;
    try {
      this.database.setJobStatus(jobId, 'scanning');
      const status = await this.scanner.sync({
        address: enrollment.address,
        verificationKey: enrollment.verificationKey,
        sponsorDustAddress: this.campaign.sponsorDustAddress,
      });
      assertEligible(
        status,
        this.campaign.sponsorDustAddress,
        this.campaign.minimumRegisteredNight
      );
      this.database.setJobStatus(jobId, 'submitting');
      const current = await this.operator.lookup(identityBytes(identity));
      if (current?.enrollmentNonce !== enrollment.nonce) {
        await enrollDelegator({
          enrollment: enrollment.payload,
          campaign: this.campaign,
          verifier: this.verifier,
          registrationProvider: { getStatus: async () => status },
          verificationBlock: status.finalizedBlock,
          operator: this.operator,
        });
      }
      this.database.setEnrollmentStatus(identity, 'active', status);
      this.database.setJobStatus(jobId, 'active');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const code = errorCode(error);
      if (code === 'DELEGATOR_STALE') {
        await this.removeIfPresent(identity);
        this.database.setEnrollmentStatus(identity, 'ineligible', undefined, message);
        this.database.setJobStatus(jobId, 'ineligible', code, message);
      } else {
        this.database.setEnrollmentStatus(identity, 'unknown', undefined, message);
        const attempts = this.database.incrementJobAttempts(jobId);
        if (attempts >= 5) {
          this.database.setJobStatus(jobId, 'failed', code, message);
        } else {
          const retryMs = Math.min(2 ** (attempts - 1) * 1_000, 30_000);
          const retry = setTimeout(() => {
            this.retryTimers.delete(retry);
            if (this.running) this.serialize(async () => this.process(jobId, identity));
          }, retryMs);
          this.retryTimers.add(retry);
          retry.unref();
        }
      }
    }
  }

  async revalidate(identity?: string) {
    return this.serialize(async () => {
      const enrollments = identity
        ? [this.database.getEnrollment(identity)].filter((value) => value !== undefined)
        : this.database
            .listEnrollments()
            .filter((value) => value.status === 'active' || value.status === 'unknown');
      for (const enrollment of enrollments) {
        try {
          const status = await this.scanner.sync({
            address: enrollment.address,
            verificationKey: enrollment.verificationKey,
            sponsorDustAddress: this.campaign.sponsorDustAddress,
          });
          assertEligible(
            status,
            this.campaign.sponsorDustAddress,
            this.campaign.minimumRegisteredNight
          );
          const queued = await this.operator.lookup(identityBytes(enrollment.identity));
          if (queued?.enrollmentNonce === enrollment.nonce) {
            this.database.setEnrollmentStatus(enrollment.identity, 'active', status);
          } else {
            this.database.setEnrollmentStatus(
              enrollment.identity,
              'unknown',
              status,
              'QUEUE_ENTRY_NOT_CONFIRMED'
            );
          }
        } catch (error) {
          const code = errorCode(error);
          if (code !== 'DELEGATOR_STALE') {
            this.database.setEnrollmentStatus(
              enrollment.identity,
              'unknown',
              undefined,
              error instanceof Error ? error.message : String(error)
            );
            continue;
          }
          await this.removeIfPresent(enrollment.identity);
          this.database.setEnrollmentStatus(
            enrollment.identity,
            'ineligible',
            undefined,
            error instanceof Error ? error.message : String(error)
          );
        }
      }
    });
  }

  async remove(identity: string) {
    return this.serialize(async () => {
      await this.removeIfPresent(identity);
      this.database.setEnrollmentStatus(identity, 'ineligible', undefined, 'REMOVED');
    });
  }

  private async removeIfPresent(identity: string) {
    if (await this.operator.lookup(identityBytes(identity))) {
      await this.operator.remove(identityBytes(identity));
    }
  }

  private async revalidateIfBlockAdvanced() {
    if (this.revalidationInFlight) return;
    this.revalidationInFlight = true;
    try {
      if (!this.running) return;
      const height = await this.scanner.latestFinalizedBlock();
      if (!this.running) return;
      const previous = BigInt(this.database.getMetadata('last_revalidated_block') ?? '-1');
      if (height <= previous) return;
      await this.revalidate();
      this.database.setMetadata('last_revalidated_block', height.toString());
    } catch {
      // Unknown indexer state must fail sponsorship closed but must never be
      // interpreted as finalized proof that a delegator became invalid.
      for (const enrollment of this.database
        .listEnrollments()
        .filter((value) => value.status === 'active' || value.status === 'unknown')) {
        this.database.setEnrollmentStatus(
          enrollment.identity,
          'unknown',
          undefined,
          'ELIGIBILITY_QUERY_FAILED'
        );
      }
    } finally {
      this.revalidationInFlight = false;
    }
  }

  private runBackground(action: Promise<void>) {
    this.background.add(action);
    void action.finally(() => this.background.delete(action));
  }
}

const errorCode = (error: unknown) =>
  error instanceof EligibilityError
    ? error.code
    : error instanceof Error && error.message === 'ENROLLMENT_REPLAYED'
      ? 'ENROLLMENT_REPLAYED'
      : error instanceof Error &&
          (error.message.includes('submitting scoped transaction') ||
            error.message.includes('Proof Server'))
        ? 'OPERATOR_SUBMISSION_FAILED'
        : 'ELIGIBILITY_QUERY_FAILED';
