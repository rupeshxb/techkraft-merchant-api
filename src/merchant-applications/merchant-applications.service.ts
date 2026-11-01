import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/auth.types';
import { RiskReviewProducer } from '../risk-review/risk-review.producer';
import { RiskResult } from '../risk-review/risk-review.types';
import { User } from '../users/entities/user.entity';
import { Role } from '../users/enums/role.enum';
import { AssignReviewerDto } from './dto/assign-reviewer.dto';
import { CreateApplicationDto } from './dto/create-application.dto';
import { ListApplicationsDto } from './dto/list-applications.dto';
import { ReviewDecisionDto } from './dto/review-decision.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';
import { MerchantApplication } from './entities/merchant-application.entity';
import { ApplicationStatus } from './enums/application-status.enum';

export interface PaginatedApplications {
  data: MerchantApplication[];
  total: number;
  page: number;
  limit: number;
}

const RELATIONS = { createdBy: true, assignedReviewer: true } as const;

const EDITABLE_STATUSES = [
  ApplicationStatus.PENDING,
  ApplicationStatus.INFO_REQUESTED,
];

const ENTITY_TYPE = 'MerchantApplication';

@Injectable()
export class MerchantApplicationsService {
  private readonly logger = new Logger(MerchantApplicationsService.name);

  constructor(
    @InjectRepository(MerchantApplication)
    private readonly applications: Repository<MerchantApplication>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly riskReviewProducer: RiskReviewProducer,
    private readonly audit: AuditService,
  ) {}

  async create(
    dto: CreateApplicationDto,
    currentUser: AuthUser,
  ): Promise<MerchantApplication> {
    const saved = await this.applications.save(
      this.applications.create({
        ...dto,
        status: ApplicationStatus.PENDING,
        createdBy: { id: currentUser.id },
      }),
    );

    const jobId = `risk-check-${saved.id}`;
    await this.applications.update(saved.id, { riskJobId: jobId });
    try {
      await this.riskReviewProducer.enqueue(saved.id, jobId);
    } catch (error) {
      // The application is already persisted; do not fail the request.
      this.logger.error(
        `Failed to enqueue risk check for ${saved.id}`,
        error instanceof Error ? error.stack : String(error),
      );
    }

    await this.audit.log({
      ...this.actor(currentUser),
      action: 'APPLICATION_CREATED',
      entityType: ENTITY_TYPE,
      entityId: saved.id,
      metadata: { businessName: saved.businessName },
    });
    return this.findEntity(saved.id);
  }

  async findAll(
    query: ListApplicationsDto,
    currentUser: AuthUser,
  ): Promise<PaginatedApplications> {
    const { status, page, limit } = query;
    const [data, total] = await this.applications.findAndCount({
      where: {
        ...(status && { status }),
        ...(currentUser.role === Role.SALES && {
          createdBy: { id: currentUser.id },
        }),
      },
      relations: RELATIONS,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total, page, limit };
  }

  async findOne(
    id: string,
    currentUser: AuthUser,
  ): Promise<MerchantApplication> {
    const application = await this.findEntity(id);
    this.assertCanAccess(application, currentUser);
    return application;
  }

  async update(
    id: string,
    dto: UpdateApplicationDto,
    currentUser: AuthUser,
  ): Promise<MerchantApplication> {
    const application = await this.findEntity(id);
    this.assertCanAccess(application, currentUser);

    if (!EDITABLE_STATUSES.includes(application.status)) {
      throw new UnprocessableEntityException(
        `Application cannot be edited while status is ${application.status}`,
      );
    }

    Object.assign(application, dto);
    // Resubmitting after an info request puts the application back in review.
    if (application.status === ApplicationStatus.INFO_REQUESTED) {
      application.status = ApplicationStatus.UNDER_REVIEW;
    }
    await this.applications.save(application);
    await this.audit.log({
      ...this.actor(currentUser),
      action: 'APPLICATION_UPDATED',
      entityType: ENTITY_TYPE,
      entityId: id,
      metadata: { fields: Object.keys(dto) },
    });
    return this.findEntity(id);
  }

  async assignReviewer(
    id: string,
    dto: AssignReviewerDto,
    currentUser: AuthUser,
  ): Promise<MerchantApplication> {
    const application = await this.findEntity(id);

    if (
      application.status === ApplicationStatus.APPROVED ||
      application.status === ApplicationStatus.REJECTED
    ) {
      throw new UnprocessableEntityException(
        `Cannot assign a reviewer to an application that is ${application.status}`,
      );
    }

    const reviewer = await this.users.findOne({ where: { id: dto.reviewerId } });
    if (!reviewer) {
      throw new NotFoundException('Reviewer not found');
    }
    if (reviewer.role !== Role.REVIEWER) {
      throw new BadRequestException('User is not a REVIEWER');
    }

    application.assignedReviewer = reviewer;
    if (application.status === ApplicationStatus.PENDING) {
      application.status = ApplicationStatus.UNDER_REVIEW;
    }
    await this.applications.save(application);
    await this.audit.log({
      ...this.actor(currentUser),
      action: 'REVIEWER_ASSIGNED',
      entityType: ENTITY_TYPE,
      entityId: id,
      metadata: { reviewerId: reviewer.id },
    });
    return this.findEntity(id);
  }

  async recordDecision(
    id: string,
    dto: ReviewDecisionDto,
    currentUser: AuthUser,
  ): Promise<MerchantApplication> {
    const application = await this.findEntity(id);

    if (application.assignedReviewer?.id !== currentUser.id) {
      throw new ForbiddenException(
        'Only the assigned reviewer can record a decision',
      );
    }
    if (application.status !== ApplicationStatus.UNDER_REVIEW) {
      throw new UnprocessableEntityException(
        `Cannot move application from ${application.status} to ${dto.decision}`,
      );
    }

    application.status = dto.decision;
    application.reviewNotes = dto.notes ?? null;
    await this.applications.save(application);
    await this.audit.log({
      ...this.actor(currentUser),
      action: 'DECISION_RECORDED',
      entityType: ENTITY_TYPE,
      entityId: id,
      metadata: { decision: dto.decision, notes: dto.notes ?? null },
    });
    return this.findEntity(id);
  }

  /**
   * Stores a risk-check result and moves a PENDING application to
   * UNDER_REVIEW. Written as one conditional UPDATE so a duplicate or retried
   * job cannot overwrite an earlier result, and a decision made in the
   * meantime is never reverted. Returns false if a result was already stored.
   */
  async applyRiskResult(id: string, result: RiskResult): Promise<boolean> {
    const outcome = await this.applications
      .createQueryBuilder()
      .update(MerchantApplication)
      .set({
        ...result,
        riskProcessedAt: () => 'now()',
        status: () =>
          `CASE WHEN "status" = 'PENDING' THEN 'UNDER_REVIEW'::merchant_applications_status_enum ELSE "status" END`,
      })
      .where('id = :id AND "riskProcessedAt" IS NULL', { id })
      .execute();
    return (outcome.affected ?? 0) > 0;
  }

  /** Loads an application with its relations; no access checks. */
  async findEntity(id: string): Promise<MerchantApplication> {
    const application = await this.applications.findOne({
      where: { id },
      relations: RELATIONS,
    });
    if (!application) {
      throw new NotFoundException(`Application ${id} not found`);
    }
    return application;
  }

  private actor(user: AuthUser) {
    return { userId: user.id, userEmail: user.email, userRole: user.role };
  }

  private assertCanAccess(
    application: MerchantApplication,
    user: AuthUser,
  ): void {
    if (user.role === Role.SALES && application.createdBy.id !== user.id) {
      throw new ForbiddenException('You do not have access to this application');
    }
  }
}
