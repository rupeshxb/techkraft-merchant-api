import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  RISK_CHECK_JOB,
  RISK_REVIEW_QUEUE,
  RiskCheckJobData,
} from './risk-review.types';

@Injectable()
export class RiskReviewProducer {
  constructor(
    @InjectQueue(RISK_REVIEW_QUEUE)
    private readonly queue: Queue<RiskCheckJobData>,
  ) {}

  /** `jobId` makes enqueueing idempotent: BullMQ ignores duplicate ids. */
  async enqueue(applicationId: string, jobId: string): Promise<void> {
    await this.queue.add(
      RISK_CHECK_JOB,
      { applicationId },
      {
        jobId,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );
  }
}
