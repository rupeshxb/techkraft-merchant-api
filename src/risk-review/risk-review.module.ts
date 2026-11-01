import { BullModule } from '@nestjs/bullmq';
import { Module, forwardRef } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { MerchantApplicationsModule } from '../merchant-applications/merchant-applications.module';
import { RiskReviewProcessor } from './risk-review.processor';
import { RiskReviewProducer } from './risk-review.producer';
import { RISK_REVIEW_QUEUE } from './risk-review.types';

@Module({
  imports: [
    BullModule.registerQueue({ name: RISK_REVIEW_QUEUE }),
    AuditModule,
    forwardRef(() => MerchantApplicationsModule),
  ],
  providers: [RiskReviewProducer, RiskReviewProcessor],
  exports: [RiskReviewProducer],
})
export class RiskReviewModule {}
