import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { ApplicationStatus } from '../enums/application-status.enum';
import { BusinessType } from '../enums/business-type.enum';
import { RiskStatus } from '../enums/risk-status.enum';

@Entity('merchant_applications')
export class MerchantApplication {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  businessName!: string;

  @Column()
  legalBusinessName!: string;

  @Column({
    type: 'enum',
    enum: BusinessType,
    enumName: 'merchant_applications_business_type_enum',
  })
  businessType!: BusinessType;

  @Column()
  ownerFirstName!: string;

  @Column()
  ownerLastName!: string;

  @Column()
  ownerEmail!: string;

  @Column()
  ownerPhone!: string;

  @Column()
  businessAddress!: string;

  /** Monthly processing volume. */
  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    transformer: {
      to: (value?: number) => value,
      from: (value: string | null) => (value === null ? value : Number(value)),
    },
  })
  requestedProcessingVolume!: number;

  @Column({ default: 'NPR' })
  requestedProcessingCurrency!: string;

  @Index()
  @Column({
    type: 'enum',
    enum: ApplicationStatus,
    enumName: 'merchant_applications_status_enum',
    default: ApplicationStatus.PENDING,
  })
  status!: ApplicationStatus;

  @Column({
    type: 'enum',
    enum: RiskStatus,
    enumName: 'merchant_applications_risk_status_enum',
    default: RiskStatus.PENDING,
  })
  riskStatus!: RiskStatus;

  @Column({ type: 'int', nullable: true })
  riskScore!: number | null;

  @Column({ type: 'text', nullable: true })
  riskNotes!: string | null;

  @Column({ type: 'timestamp', nullable: true })
  riskProcessedAt!: Date | null;

  /** Used for idempotency of the risk-check job. */
  @Column({ type: 'varchar', nullable: true })
  riskJobId!: string | null;

  /** Notes left by the reviewer with their latest decision. */
  @Column({ type: 'text', nullable: true })
  reviewNotes!: string | null;

  @ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' })
  createdBy!: User;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  assignedReviewer!: User | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
