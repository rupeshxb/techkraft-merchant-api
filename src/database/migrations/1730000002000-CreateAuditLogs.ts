import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAuditLogs1730000002000 implements MigrationInterface {
  name = 'CreateAuditLogs1730000002000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "audit_logs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" character varying NOT NULL,
        "userEmail" character varying NOT NULL,
        "userRole" character varying NOT NULL,
        "action" character varying NOT NULL,
        "entityType" character varying NOT NULL,
        "entityId" character varying NOT NULL,
        "metadata" jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_audit_logs_id" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_logs_entityId" ON "audit_logs" ("entityId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_audit_logs_entityId"`);
    await queryRunner.query(`DROP TABLE "audit_logs"`);
  }
}
