import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateAuditLogDto } from './dto/create-audit-log.dto';
import { ListAuditLogsDto } from './dto/list-audit-logs.dto';
import { AuditLog } from './entities/audit-log.entity';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogs: Repository<AuditLog>,
  ) {}

  /** Never throws: a failed audit write must not break the main flow. */
  async log(data: CreateAuditLogDto): Promise<void> {
    try {
      await this.auditLogs.save(
        this.auditLogs.create({ ...data, metadata: data.metadata ?? null }),
      );
    } catch (error) {
      this.logger.error(
        `Failed to write audit log ${data.action} for ${data.entityId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async findAll({ entityId, page, limit }: ListAuditLogsDto) {
    const [data, total] = await this.auditLogs.findAndCount({
      where: entityId ? { entityId } : {},
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total, page, limit };
  }
}
