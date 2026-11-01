import { RiskStatus } from '../merchant-applications/enums/risk-status.enum';

export const RISK_REVIEW_QUEUE = 'risk-review';
export const RISK_CHECK_JOB = 'process-risk-check';

export interface RiskCheckJobData {
  applicationId: string;
}

export interface RiskResult {
  riskStatus: RiskStatus;
  riskScore: number;
  riskNotes: string;
}
