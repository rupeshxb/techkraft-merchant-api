import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../users/enums/role.enum';
import { AuditService } from './audit.service';
import { ListAuditLogsDto } from './dto/list-audit-logs.dto';

@ApiTags('audit')
@ApiBearerAuth()
@ApiResponse({ status: 401, description: 'Missing or invalid token' })
@ApiResponse({ status: 403, description: 'ADMIN role required' })
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get('logs')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'List audit logs, newest first (ADMIN only)' })
  @ApiResponse({ status: 200, description: '{ data, total, page, limit }' })
  @ApiResponse({ status: 400, description: 'Invalid query parameters' })
  findAll(@Query() query: ListAuditLogsDto) {
    return this.audit.findAll(query);
  }
}
