import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, NotFoundException } from '@nestjs/common';
import { Job } from 'bullmq';
import { AuditService } from '../audit/audit.service';
import { MerchantApplicationsService } from '../merchant-applications/merchant-applications.service';
import { RiskStatus } from '../merchant-applications/enums/risk-status.enum';
import {
  RISK_CHECK_JOB,
  RISK_REVIEW_QUEUE,
  RiskCheckJobData,
  RiskResult,
} from './risk-review.types';

@Processor(RISK_REVIEW_QUEUE)
export class RiskReviewProcessor extends WorkerHost {
  private readonly logger = new Logger(RiskReviewProcessor.name);

  constructor(
    private readonly applications: MerchantApplicationsService,
    private readonly audit: AuditService,
  ) {
    super();
  }

  async process(job: Job<RiskCheckJobData>): Promise<void> {
    if (job.name !== RISK_CHECK_JOB) {
      this.logger.warn(`Ignoring unknown job "${job.name}" (${job.id})`);
      return;
    }

    const { applicationId } = job.data;

    let application;
    try {
      application = await this.applications.findEntity(applicationId);
    } catch (error) {
      if (error instanceof NotFoundException) {
        this.logger.warn(
          `Application ${applicationId} not found; dropping job ${job.id}`,
        );
        return;
      }
      throw error;
    }

    // Idempotency: must run before the (expensive) simulation.
    if (application.riskProcessedAt !== null) {
      this.logger.log(
        `Application ${applicationId} already risk-processed; skipping job ${job.id}`,
      );
      return;
    }

    await this.sleep(this.randomInt(1000, 3000));
    const result = this.simulateKyb();

    // Conditional on riskProcessedAt IS NULL, so a retried or duplicate job
    // cannot overwrite an earlier result.
    const applied = await this.applications.applyRiskResult(
      applicationId,
      result,
    );
    if (!applied) {
      this.logger.log(
        `Application ${applicationId} was risk-processed concurrently; result discarded`,
      );
      return;
    }

    await this.audit.log({
      userId: 'system',
      userEmail: 'system',
      userRole: 'SYSTEM',
      action: 'RISK_CHECK_COMPLETED',
      entityType: 'MerchantApplication',
      entityId: applicationId,
      metadata: { riskStatus: result.riskStatus, riskScore: result.riskScore },
    });

    this.logger.log(
      `Risk check complete for ${applicationId}: ${result.riskStatus} (score ${result.riskScore})`,
    );
  }

  private simulateKyb(): RiskResult {
    const roll = Math.random();
    if (roll < 0.6) {
      return {
        riskStatus: RiskStatus.PASS,
        riskScore: this.randomInt(75, 95),
        riskNotes: 'Automated KYB check passed.',
      };
    }
    if (roll < 0.85) {
      return {
        riskStatus: RiskStatus.MANUAL_REVIEW,
        riskScore: this.randomInt(40, 74),
        riskNotes: 'Automated KYB check inconclusive; manual review required.',
      };
    }
    return {
      riskStatus: RiskStatus.FAIL,
      riskScore: this.randomInt(0, 39),
      riskNotes: 'Automated KYB check failed.',
    };
  }

  private randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
