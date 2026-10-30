import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMerchantApplications1730000001000
  implements MigrationInterface
{
  name = 'CreateMerchantApplications1730000001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."merchant_applications_business_type_enum" AS ENUM('SOLE_PROPRIETORSHIP', 'PARTNERSHIP', 'PRIVATE_LIMITED', 'PUBLIC_LIMITED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."merchant_applications_status_enum" AS ENUM('PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'INFO_REQUESTED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."merchant_applications_risk_status_enum" AS ENUM('PENDING', 'PASS', 'FAIL', 'MANUAL_REVIEW')`,
    );
    await queryRunner.query(
      `CREATE TABLE "merchant_applications" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "businessName" character varying NOT NULL,
        "legalBusinessName" character varying NOT NULL,
        "businessType" "public"."merchant_applications_business_type_enum" NOT NULL,
        "ownerFirstName" character varying NOT NULL,
        "ownerLastName" character varying NOT NULL,
        "ownerEmail" character varying NOT NULL,
        "ownerPhone" character varying NOT NULL,
        "businessAddress" character varying NOT NULL,
        "requestedProcessingVolume" numeric(14,2) NOT NULL,
        "requestedProcessingCurrency" character varying NOT NULL DEFAULT 'NPR',
        "status" "public"."merchant_applications_status_enum" NOT NULL DEFAULT 'PENDING',
        "riskStatus" "public"."merchant_applications_risk_status_enum" NOT NULL DEFAULT 'PENDING',
        "riskScore" integer,
        "riskNotes" text,
        "riskProcessedAt" TIMESTAMP,
        "riskJobId" character varying,
        "reviewNotes" text,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "createdById" uuid NOT NULL,
        "assignedReviewerId" uuid,
        CONSTRAINT "PK_merchant_applications_id" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f9b444dd14c28c317a317eddac" ON "merchant_applications" ("status")`,
    );
    await queryRunner.query(
      `ALTER TABLE "merchant_applications" ADD CONSTRAINT "FK_524da5b7f60bec9e2c86797f58c" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "merchant_applications" ADD CONSTRAINT "FK_7cebc08ee446c36158cbd584a0a" FOREIGN KEY ("assignedReviewerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "merchant_applications"`);
    await queryRunner.query(
      `DROP TYPE "public"."merchant_applications_risk_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."merchant_applications_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."merchant_applications_business_type_enum"`,
    );
  }
}
