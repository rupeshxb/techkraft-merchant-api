import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { RiskReviewModule } from '../risk-review/risk-review.module';
import { User } from '../users/entities/user.entity';
import { MerchantApplication } from './entities/merchant-application.entity';
import { ApplicationPolicyGuard } from './guards/application-policy.guard';
import { MerchantApplicationsController } from './merchant-applications.controller';
import { MerchantApplicationsService } from './merchant-applications.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([MerchantApplication, User]),
    AuditModule,
    forwardRef(() => RiskReviewModule),
  ],
  controllers: [MerchantApplicationsController],
  providers: [MerchantApplicationsService, ApplicationPolicyGuard],
  exports: [MerchantApplicationsService],
})
export class MerchantApplicationsModule {}
