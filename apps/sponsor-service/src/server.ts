import { timingSafeEqual } from 'node:crypto';
import type { SignedEnrollment } from '@midnight-sentinel/api/sponsorship/eligibility';
import Fastify from 'fastify';
import { z } from 'zod';
import type { ServiceConfig } from './config.js';
import type { EligibilityService } from './service.js';

const enrollmentSchema = z.object({
  payload: z.object({
    version: z.literal(1),
    network: z.string(),
    sentinelAddress: z.string(),
    sponsorDustAddress: z.string(),
    nightRewardAddress: z.string(),
    nightVerificationKey: z.string(),
    shieldedCoinPublicKey: z.string(),
    shieldedEncryptionPublicKey: z.string(),
    nonce: z.string(),
    expiresAt: z.string(),
  }),
  signature: z.string(),
});

const authorized = (provided: string | undefined, expected: string) => {
  const prefix = 'Bearer ';
  if (!provided?.startsWith(prefix)) return false;
  const actual = Buffer.from(provided.slice(prefix.length));
  const wanted = Buffer.from(expected);
  return actual.length === wanted.length && timingSafeEqual(actual, wanted);
};

export const buildServer = (config: ServiceConfig, service: EligibilityService) => {
  const app = Fastify({
    logger: true,
    bodyLimit: 64 * 1024,
  });
  const rate = new Map<string, { count: number; reset: number }>();

  app.get('/healthz', async () => ({ ok: true }));
  app.get('/readyz', async (_request, reply) => {
    try {
      await service.database.sqlite.prepare('SELECT 1').get();
      return { ready: true };
    } catch {
      return reply.code(503).send({ ready: false });
    }
  });

  app.post('/v1/enrollments', async (request, reply) => {
    const key = request.ip;
    const now = Date.now();
    const window = rate.get(key);
    const current = !window || window.reset <= now ? { count: 0, reset: now + 60_000 } : window;
    current.count += 1;
    rate.set(key, current);
    if (current.count > 10) {
      return reply.code(429).send({ code: 'RATE_LIMITED' });
    }
    try {
      const enrollment = enrollmentSchema.parse(request.body) as SignedEnrollment;
      const submitted = service.submit(enrollment);
      return reply.code(202).send({
        ...submitted,
        statusUrl: `/v1/jobs/${submitted.jobId}`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const code = message.includes('REPLAYED') ? 'ENROLLMENT_REPLAYED' : 'ENROLLMENT_INVALID';
      return reply.code(400).send({ code, message });
    }
  });

  app.get<{ Params: { jobId: string } }>('/v1/jobs/:jobId', async (request, reply) => {
    const job = service.getJob(request.params.jobId);
    return job ?? reply.code(404).send({ code: 'JOB_NOT_FOUND' });
  });

  app.get<{ Params: { address: string } }>('/v1/eligibility/:address', async (request, reply) => {
    const status = service.getStatus(request.params.address);
    if (!status) {
      return reply.code(404).send({ code: 'ENROLLMENT_NOT_FOUND' });
    }
    return {
      ...status,
      nightBalance: status.nightBalance.toString(),
      finalizedBlock: status.finalizedBlock.toString(),
    };
  });

  app.post<{ Body: { identity?: string } }>('/v1/admin/revalidate', async (request, reply) => {
    if (!authorized(request.headers.authorization, config.adminToken)) {
      return reply.code(401).send({ code: 'UNAUTHORIZED' });
    }
    const identity = request.body?.identity;
    if (identity && !/^[0-9a-fA-F]{64}$/.test(identity)) {
      return reply.code(400).send({ code: 'INVALID_IDENTITY' });
    }
    void service.revalidate(identity?.toLowerCase());
    return reply.code(202).send({ accepted: true });
  });

  app.delete<{ Params: { identity: string } }>(
    '/v1/admin/delegators/:identity',
    async (request, reply) => {
      if (!authorized(request.headers.authorization, config.adminToken)) {
        return reply.code(401).send({ code: 'UNAUTHORIZED' });
      }
      if (!/^[0-9a-fA-F]{64}$/.test(request.params.identity)) {
        return reply.code(400).send({ code: 'INVALID_IDENTITY' });
      }
      await service.remove(request.params.identity.toLowerCase());
      return reply.code(204).send();
    }
  );

  return app;
};
