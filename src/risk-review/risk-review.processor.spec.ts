import { NotFoundException } from '@nestjs/common';
import { Job } from 'bullmq';
import { RiskStatus } from '../merchant-applications/enums/risk-status.enum';
import { RiskReviewProcessor } from './risk-review.processor';
import { RiskCheckJobData } from './risk-review.types';

const job = {
  id: 'job-1',
  name: 'process-risk-check',
  data: { applicationId: 'app-1' },
} as Job<RiskCheckJobData>;

describe('RiskReviewProcessor', () => {
  let processor: RiskReviewProcessor;
  let sleep: jest.SpyInstance;
  const applications = { findEntity: jest.fn(), applyRiskResult: jest.fn() };
  const audit = { log: jest.fn() };

  beforeEach(() => {
    jest.resetAllMocks();
    processor = new RiskReviewProcessor(applications as never, audit as never);
    // Skip the simulated 1-3s KYB latency.
    sleep = jest
      .spyOn(processor as never, 'sleep')
      .mockResolvedValue(undefined as never);
    applications.applyRiskResult.mockResolvedValue(true);
  });

  afterEach(() => jest.restoreAllMocks());

  it('skips processing when riskProcessedAt is already set', async () => {
    applications.findEntity.mockResolvedValue({ riskProcessedAt: new Date() });

    await processor.process(job);

    expect(sleep).not.toHaveBeenCalled();
    expect(applications.applyRiskResult).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('stores riskStatus, riskScore and riskNotes after processing', async () => {
    applications.findEntity.mockResolvedValue({ riskProcessedAt: null });
    jest.spyOn(Math, 'random').mockReturnValue(0.1);

    await processor.process(job);

    expect(sleep).toHaveBeenCalledTimes(1);
    const [id, result] = applications.applyRiskResult.mock.calls[0];
    expect(id).toBe('app-1');
    expect(result.riskStatus).toBe(RiskStatus.PASS);
    expect(result.riskScore).toBeGreaterThanOrEqual(75);
    expect(result.riskScore).toBeLessThanOrEqual(95);
    expect(typeof result.riskNotes).toBe('string');
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'RISK_CHECK_COMPLETED',
        entityId: 'app-1',
        metadata: { riskStatus: RiskStatus.PASS, riskScore: result.riskScore },
      }),
    );
  });

  it.each([
    [0.7, RiskStatus.MANUAL_REVIEW, 40, 74],
    [0.9, RiskStatus.FAIL, 0, 39],
  ])('maps random=%s to %s with a score in range', async (roll, status, min, max) => {
    applications.findEntity.mockResolvedValue({ riskProcessedAt: null });
    jest.spyOn(Math, 'random').mockReturnValue(roll);

    await processor.process(job);

    const result = applications.applyRiskResult.mock.calls[0][1];
    expect(result.riskStatus).toBe(status);
    expect(result.riskScore).toBeGreaterThanOrEqual(min);
    expect(result.riskScore).toBeLessThanOrEqual(max);
  });

  it('delegates the PENDING -> UNDER_REVIEW transition to applyRiskResult', async () => {
    // The status move is part of the same conditional UPDATE as the risk
    // fields (see MerchantApplicationsService.applyRiskResult), so a
    // decision made in the meantime is never overwritten.
    applications.findEntity.mockResolvedValue({ riskProcessedAt: null });

    await processor.process(job);

    expect(applications.applyRiskResult).toHaveBeenCalledTimes(1);
  });

  it('does not audit when the result was already stored concurrently', async () => {
    applications.findEntity.mockResolvedValue({ riskProcessedAt: null });
    applications.applyRiskResult.mockResolvedValue(false);

    await processor.process(job);

    expect(audit.log).not.toHaveBeenCalled();
  });

  it('handles application not found gracefully', async () => {
    applications.findEntity.mockRejectedValue(new NotFoundException());

    await expect(processor.process(job)).resolves.toBeUndefined();
    expect(applications.applyRiskResult).not.toHaveBeenCalled();
  });

  it('rethrows unexpected errors so BullMQ retries the job', async () => {
    applications.findEntity.mockRejectedValue(new Error('db down'));

    await expect(processor.process(job)).rejects.toThrow('db down');
  });
});
