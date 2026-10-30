import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthUser } from '../auth/auth.types';
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

@Injectable()
export class MerchantApplicationsService {
  constructor(
    @InjectRepository(MerchantApplication)
    private readonly applications: Repository<MerchantApplication>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
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
    return this.findEntity(id);
  }

  async assignReviewer(
    id: string,
    dto: AssignReviewerDto,
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
    return this.findEntity(id);
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

  private assertCanAccess(
    application: MerchantApplication,
    user: AuthUser,
  ): void {
    if (user.role === Role.SALES && application.createdBy.id !== user.id) {
      throw new ForbiddenException('You do not have access to this application');
    }
  }
}
