export interface CreateAuditLogDto {
  userId: string;
  userEmail: string;
  userRole: string;
  action: string;
  entityType: string;
  entityId: string;
  /** Extra context. Must never contain passwords, tokens or other secrets. */
  metadata?: Record<string, unknown> | null;
}
