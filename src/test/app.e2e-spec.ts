import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../app.module';
import { GlobalHttpExceptionFilter } from '../common/filters/http-exception.filter';
import { RiskStatus } from '../merchant-applications/enums/risk-status.enum';

/**
 * Runs against the real Postgres and Redis from docker-compose, with the
 * seeded users (`npm run seed`). The BullMQ worker runs in-process.
 */
describe('Merchant onboarding API (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  const createdIds: string[] = [];

  const tokens: Record<string, string> = {};
  const users = {
    admin: ['admin@techkraft.com', 'Admin@123'],
    reviewer: ['reviewer@techkraft.com', 'Reviewer@123'],
    sales: ['sales@techkraft.com', 'Sales@123'],
    sales2: ['sales2@techkraft.com', 'Sales@123'],
  } as const;

  const payload = {
    businessName: 'E2E Business',
    legalBusinessName: 'E2E Business Pvt. Ltd.',
    businessType: 'PRIVATE_LIMITED',
    ownerFirstName: 'Test',
    ownerLastName: 'Owner',
    ownerEmail: 'owner@e2e.test',
    ownerPhone: '+9779800000000',
    businessAddress: 'Kathmandu',
    requestedProcessingVolume: 500000,
  };

  const auth = (who: keyof typeof users) => ({
    Authorization: `Bearer ${tokens[who]}`,
  });

  const createApplication = async () => {
    const res = await http
      .post('/applications')
      .set(auth('sales'))
      .send(payload)
      .expect(201);
    createdIds.push(res.body.id);
    return res.body.id as string;
  };

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new GlobalHttpExceptionFilter());
    await app.init();
    http = request(app.getHttpServer());

    for (const [who, [email, password]] of Object.entries(users)) {
      const res = await http
        .post('/auth/login')
        .send({ email, password })
        .expect(200);
      tokens[who] = res.body.accessToken;
    }
  });

  afterAll(async () => {
    // Let in-flight risk jobs finish, then remove the data this suite created.
    await sleep(3500);
    const ds = app.get(DataSource);
    if (createdIds.length > 0) {
      await ds.query(`DELETE FROM audit_logs WHERE "entityId" = ANY($1)`, [
        createdIds,
      ]);
      await ds.query(`DELETE FROM merchant_applications WHERE id = ANY($1)`, [
        createdIds,
      ]);
    }
    await app.close();
  });

  describe('auth', () => {
    it('POST /auth/login with valid credentials -> 200 + accessToken', async () => {
      const [email, password] = users.admin;
      const res = await http.post('/auth/login').send({ email, password }).expect(200);
      expect(res.body.accessToken).toEqual(expect.any(String));
      expect(res.body.user).toMatchObject({ email, role: 'ADMIN' });
      expect(JSON.stringify(res.body)).not.toContain('password');
    });

    it('POST /auth/login with wrong password -> 401', async () => {
      await http
        .post('/auth/login')
        .send({ email: users.admin[0], password: 'wrong' })
        .expect(401);
    });

    it('GET /auth/me without token -> 401', async () => {
      await http.get('/auth/me').expect(401);
    });
  });

  describe('object-level authorization', () => {
    let appId: string;

    it('SALES creates an application -> 201', async () => {
      const res = await http
        .post('/applications')
        .set(auth('sales'))
        .send(payload)
        .expect(201);
      appId = res.body.id;
      createdIds.push(appId);
      expect(res.body.status).toBe('PENDING');
    });

    it("sales2 GET /applications/:id (another user's application) -> 403", async () => {
      await http.get(`/applications/${appId}`).set(auth('sales2')).expect(403);
    });

    it('sales2 GET /applications -> empty list', async () => {
      const res = await http.get('/applications').set(auth('sales2')).expect(200);
      expect(res.body.data).toEqual([]);
      expect(res.body.total).toBe(0);
    });

    it('SALES GET /applications/:id (own application) -> 200', async () => {
      const res = await http.get(`/applications/${appId}`).set(auth('sales')).expect(200);
      expect(res.body.id).toBe(appId);
      expect(JSON.stringify(res.body)).not.toContain('password');
    });
  });

  describe('review lifecycle', () => {
    let appId: string;
    let unassignedId: string;
    let reviewerId: string;

    beforeAll(async () => {
      appId = await createApplication();
      unassignedId = await createApplication();
      const me = await http.get('/auth/me').set(auth('reviewer')).expect(200);
      reviewerId = me.body.id;
    });

    it('a reviewer who is not assigned cannot decide -> 403', async () => {
      await http
        .post(`/applications/${unassignedId}/decision`)
        .set(auth('reviewer'))
        .send({ decision: 'APPROVED' })
        .expect(403);
    });

    it('only ADMIN can assign -> 403 for SALES', async () => {
      await http
        .post(`/applications/${appId}/assign`)
        .set(auth('sales'))
        .send({ reviewerId })
        .expect(403);
    });

    it('ADMIN assigns the reviewer -> 200, UNDER_REVIEW', async () => {
      const res = await http
        .post(`/applications/${appId}/assign`)
        .set(auth('admin'))
        .send({ reviewerId })
        .expect(200);
      expect(res.body.status).toBe('UNDER_REVIEW');
      expect(res.body.assignedReviewer.id).toBe(reviewerId);
    });

    it('SALES editing an UNDER_REVIEW application -> 422', async () => {
      await http
        .put(`/applications/${appId}`)
        .set(auth('sales'))
        .send({ businessName: 'Changed' })
        .expect(422);
    });

    it('assigned reviewer APPROVED decision -> 200, APPROVED', async () => {
      const res = await http
        .post(`/applications/${appId}/decision`)
        .set(auth('reviewer'))
        .send({ decision: 'APPROVED', notes: 'Looks good' })
        .expect(200);
      expect(res.body.status).toBe('APPROVED');
    });

    it('invalid state transition (APPROVED -> REJECTED) -> 422', async () => {
      await http
        .post(`/applications/${appId}/decision`)
        .set(auth('reviewer'))
        .send({ decision: 'REJECTED' })
        .expect(422);
    });

    it('a late risk result does not overwrite the decision', async () => {
      // The worker handles one job at a time, so this one may still be queued.
      let body: Record<string, unknown> = {};
      for (let i = 0; i < 40 && !body.riskProcessedAt; i++) {
        await sleep(500);
        body = (await http.get(`/applications/${appId}`).set(auth('admin')).expect(200)).body;
      }
      expect(body.riskProcessedAt).toEqual(expect.any(String));
      expect(body.status).toBe('APPROVED');
    });

    it('audit trail records the lifecycle (ADMIN only)', async () => {
      await http.get('/audit/logs').set(auth('sales')).expect(403);
      const res = await http
        .get('/audit/logs')
        .query({ entityId: appId })
        .set(auth('admin'))
        .expect(200);
      const actions = res.body.data.map((l: { action: string }) => l.action);
      expect(actions).toEqual(
        expect.arrayContaining([
          'APPLICATION_CREATED',
          'REVIEWER_ASSIGNED',
          'DECISION_RECORDED',
          'RISK_CHECK_COMPLETED',
        ]),
      );
    });
  });

  describe('async risk processing', () => {
    it('sets riskJobId, then the BullMQ worker stores a risk result', async () => {
      const id = await createApplication();

      const created = await http.get(`/applications/${id}`).set(auth('sales')).expect(200);
      expect(created.body.riskJobId).toBe(`risk-check-${id}`);

      let body: Record<string, unknown> = created.body;
      for (let i = 0; i < 20 && body.riskStatus === RiskStatus.PENDING; i++) {
        await sleep(500);
        body = (await http.get(`/applications/${id}`).set(auth('sales')).expect(200)).body;
      }

      expect(body.riskStatus).not.toBe(RiskStatus.PENDING);
      expect(body.riskProcessedAt).toEqual(expect.any(String));
      expect(body.riskScore).toEqual(expect.any(Number));
      expect(body.status).toBe('UNDER_REVIEW');
    });
  });
});
