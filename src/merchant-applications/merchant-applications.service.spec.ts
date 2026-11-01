import {
  BadRequestException,
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/auth.types';
import { RiskReviewProducer } from '../risk-review/risk-review.producer';
import { RiskStatus } from './enums/risk-status.enum';
import { User } from '../users/entities/user.entity';
import { Role } from '../users/enums/role.enum';
import { CreateApplicationDto } from './dto/create-application.dto';
import { MerchantApplication } from './entities/merchant-application.entity';
import { ApplicationStatus } from './enums/application-status.enum';
import { BusinessType } from './enums/business-type.enum';
import { MerchantApplicationsService } from './merchant-applications.service';

const sales: AuthUser = { id: 'sales-1', email: 's1@t.com', role: Role.SALES };
const sales2: AuthUser = { id: 'sales-2', email: 's2@t.com', role: Role.SALES };
const reviewer: AuthUser = { id: 'rev-1', email: 'r@t.com', role: Role.REVIEWER };
const otherReviewer: AuthUser = { id: 'rev-2', email: 'r2@t.com', role: Role.REVIEWER };
const admin: AuthUser = { id: 'admin-1', email: 'a@t.com', role: Role.ADMIN };

const createDto: CreateApplicationDto = {
  businessName: 'HB',
  legalBusinessName: 'HB Pvt',
  businessType: BusinessType.PRIVATE_LIMITED,
  ownerFirstName: 'S',
  ownerLastName: 'Sh',
  ownerEmail: 's@hb.com',
  ownerPhone: '+9779841234567',
  businessAddress: 'Thamel',
  requestedProcessingVolume: 1000,
};

function makeApplication(
  overrides: Partial<MerchantApplication> = {},
): MerchantApplication {
  return {
    id: 'app-1',
    businessName: 'HB',
    status: ApplicationStatus.PENDING,
    createdBy: { id: sales.id },
    assignedReviewer: null,
    ...overrides,
  } as MerchantApplication;
}

describe('MerchantApplicationsService', () => {
  let service: MerchantApplicationsService;
  const applications = {
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    findOne: jest.fn(),
    findAndCount: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
  const users = { findOne: jest.fn() };
  const producer = { enqueue: jest.fn() };
  const audit = { log: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        MerchantApplicationsService,
        { provide: getRepositoryToken(MerchantApplication), useValue: applications },
        { provide: getRepositoryToken(User), useValue: users },
        { provide: RiskReviewProducer, useValue: producer },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = moduleRef.get(MerchantApplicationsService);
  });

  describe('create', () => {
    it('saves the application and enqueues a risk job', async () => {
      const saved = makeApplication();
      applications.create.mockImplementation((v: unknown) => v);
      applications.save.mockResolvedValue(saved);
      applications.findOne.mockResolvedValue(saved);

      const result = await service.create(createDto, sales);

      expect(applications.save).toHaveBeenCalledWith(
        expect.objectContaining({
          businessName: 'HB',
          status: ApplicationStatus.PENDING,
          createdBy: { id: sales.id },
        }),
      );
      expect(applications.update).toHaveBeenCalledWith('app-1', {
        riskJobId: 'risk-check-app-1',
      });
      expect(producer.enqueue).toHaveBeenCalledWith('app-1', 'risk-check-app-1');
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'APPLICATION_CREATED',
          entityId: 'app-1',
          userId: sales.id,
        }),
      );
      expect(result).toBe(saved);
    });

    it('still returns the application when enqueueing fails', async () => {
      const saved = makeApplication();
      applications.create.mockImplementation((v: unknown) => v);
      applications.save.mockResolvedValue(saved);
      applications.findOne.mockResolvedValue(saved);
      producer.enqueue.mockRejectedValue(new Error('redis down'));

      await expect(service.create(createDto, sales)).resolves.toBe(saved);
    });
  });

  describe('findAll', () => {
    it('restricts SALES users to their own applications', async () => {
      applications.findAndCount.mockResolvedValue([[], 0]);

      await service.findAll({ page: 1, limit: 10 }, sales);

      expect(applications.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ createdBy: { id: sales.id } }),
        }),
      );
    });

    it('does not restrict REVIEWER users and applies the status filter', async () => {
      applications.findAndCount.mockResolvedValue([[], 0]);

      const result = await service.findAll(
        { status: ApplicationStatus.PENDING, page: 2, limit: 5 },
        reviewer,
      );

      const { where, skip, take } = applications.findAndCount.mock.calls[0][0];
      expect(where).toEqual({ status: ApplicationStatus.PENDING });
      expect(skip).toBe(5);
      expect(take).toBe(5);
      expect(result).toEqual({ data: [], total: 0, page: 2, limit: 5 });
    });
  });

  describe('findOne', () => {
    it('throws ForbiddenException when SALES accesses another sales user\'s application', async () => {
      applications.findOne.mockResolvedValue(makeApplication());

      await expect(service.findOne('app-1', sales2)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('returns the application to its owner', async () => {
      const app = makeApplication();
      applications.findOne.mockResolvedValue(app);

      await expect(service.findOne('app-1', sales)).resolves.toBe(app);
    });
  });

  describe('update', () => {
    it('throws UnprocessableEntityException when status is UNDER_REVIEW', async () => {
      applications.findOne.mockResolvedValue(
        makeApplication({ status: ApplicationStatus.UNDER_REVIEW }),
      );

      await expect(
        service.update('app-1', { businessName: 'New' }, sales),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(applications.save).not.toHaveBeenCalled();
    });

    it('moves INFO_REQUESTED back to UNDER_REVIEW on resubmission', async () => {
      applications.findOne.mockResolvedValue(
        makeApplication({ status: ApplicationStatus.INFO_REQUESTED }),
      );

      await service.update('app-1', { businessName: 'New' }, sales);

      expect(applications.save).toHaveBeenCalledWith(
        expect.objectContaining({
          businessName: 'New',
          status: ApplicationStatus.UNDER_REVIEW,
        }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'APPLICATION_UPDATED' }),
      );
    });
  });

  describe('assignReviewer', () => {
    it('throws BadRequestException when the user is not a REVIEWER', async () => {
      applications.findOne.mockResolvedValue(makeApplication());
      users.findOne.mockResolvedValue({ id: 'u1', role: Role.SALES });

      await expect(
        service.assignReviewer('app-1', { reviewerId: 'u1' }, admin),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(applications.save).not.toHaveBeenCalled();
    });

    it('assigns the reviewer and audits it', async () => {
      applications.findOne.mockResolvedValue(makeApplication());
      users.findOne.mockResolvedValue({ id: reviewer.id, role: Role.REVIEWER });

      await service.assignReviewer('app-1', { reviewerId: reviewer.id }, admin);

      expect(applications.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: ApplicationStatus.UNDER_REVIEW,
          assignedReviewer: expect.objectContaining({ id: reviewer.id }),
        }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'REVIEWER_ASSIGNED',
          metadata: { reviewerId: reviewer.id },
        }),
      );
    });
  });

  describe('recordDecision', () => {
    it('throws ForbiddenException when the caller is not the assigned reviewer', async () => {
      applications.findOne.mockResolvedValue(
        makeApplication({
          status: ApplicationStatus.UNDER_REVIEW,
          assignedReviewer: { id: reviewer.id } as User,
        }),
      );

      await expect(
        service.recordDecision(
          'app-1',
          { decision: ApplicationStatus.APPROVED },
          otherReviewer,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws UnprocessableEntityException for APPROVED -> REJECTED', async () => {
      applications.findOne.mockResolvedValue(
        makeApplication({
          status: ApplicationStatus.APPROVED,
          assignedReviewer: { id: reviewer.id } as User,
        }),
      );

      await expect(
        service.recordDecision(
          'app-1',
          { decision: ApplicationStatus.REJECTED },
          reviewer,
        ),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(applications.save).not.toHaveBeenCalled();
    });

    it('records an UNDER_REVIEW -> APPROVED decision and audits it', async () => {
      applications.findOne.mockResolvedValue(
        makeApplication({
          status: ApplicationStatus.UNDER_REVIEW,
          assignedReviewer: { id: reviewer.id } as User,
        }),
      );

      await service.recordDecision(
        'app-1',
        { decision: ApplicationStatus.APPROVED, notes: 'ok' },
        reviewer,
      );

      expect(applications.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: ApplicationStatus.APPROVED,
          reviewNotes: 'ok',
        }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'DECISION_RECORDED',
          metadata: { decision: ApplicationStatus.APPROVED, notes: 'ok' },
        }),
      );
    });
  });

  describe('applyRiskResult', () => {
    it('writes one conditional UPDATE that only moves PENDING to UNDER_REVIEW', async () => {
      const builder = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1 }),
      };
      applications.createQueryBuilder.mockReturnValue(builder);

      const applied = await service.applyRiskResult('app-1', {
        riskStatus: RiskStatus.PASS,
        riskScore: 80,
        riskNotes: 'n',
      });

      expect(applied).toBe(true);
      const set = builder.set.mock.calls[0][0];
      expect(set).toMatchObject({ riskStatus: RiskStatus.PASS, riskScore: 80 });
      expect(set.status()).toContain(`"status" = 'PENDING'`);
      expect(set.status()).toContain(`'UNDER_REVIEW'`);
      expect(builder.where.mock.calls[0][0]).toContain('"riskProcessedAt" IS NULL');
    });

    it('returns false when a result was already stored', async () => {
      applications.createQueryBuilder.mockReturnValue({
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 0 }),
      });

      await expect(
        service.applyRiskResult('app-1', {
          riskStatus: RiskStatus.FAIL,
          riskScore: 10,
          riskNotes: 'n',
        }),
      ).resolves.toBe(false);
    });
  });
});
