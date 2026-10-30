import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../users/enums/role.enum';
import { RequireAssignedReviewer } from './decorators/require-assigned-reviewer.decorator';
import { AssignReviewerDto } from './dto/assign-reviewer.dto';
import { CreateApplicationDto } from './dto/create-application.dto';
import { ListApplicationsDto } from './dto/list-applications.dto';
import { ReviewDecisionDto } from './dto/review-decision.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';
import { MerchantApplication } from './entities/merchant-application.entity';
import { ApplicationPolicyGuard } from './guards/application-policy.guard';
import { MerchantApplicationsService } from './merchant-applications.service';

@ApiTags('merchant-applications')
@ApiBearerAuth()
@ApiResponse({ status: 401, description: 'Missing or invalid token' })
@ApiResponse({ status: 403, description: 'Role or ownership check failed' })
@Controller('applications')
export class MerchantApplicationsController {
  constructor(private readonly service: MerchantApplicationsService) {}

  @Post()
  @Roles(Role.SALES)
  @ApiOperation({ summary: 'Create a merchant application' })
  @ApiResponse({ status: 201, description: 'Application created', type: MerchantApplication })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  create(@Body() dto: CreateApplicationDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, user);
  }

  @Get()
  @Roles(Role.ADMIN, Role.REVIEWER, Role.SALES)
  @ApiOperation({
    summary: 'List applications (SALES see only their own)',
  })
  @ApiResponse({ status: 200, description: '{ data, total, page, limit }' })
  @ApiResponse({ status: 400, description: 'Invalid query parameters' })
  findAll(@Query() query: ListApplicationsDto, @CurrentUser() user: AuthUser) {
    return this.service.findAll(query, user);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.REVIEWER, Role.SALES)
  @UseGuards(ApplicationPolicyGuard)
  @ApiOperation({ summary: 'Get an application by id' })
  @ApiResponse({ status: 200, description: 'The application', type: MerchantApplication })
  @ApiResponse({ status: 404, description: 'Application not found' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.findOne(id, user);
  }

  @Put(':id')
  @Roles(Role.SALES)
  @UseGuards(ApplicationPolicyGuard)
  @ApiOperation({
    summary: 'Update an application (only while PENDING or INFO_REQUESTED)',
  })
  @ApiResponse({ status: 200, description: 'Updated application', type: MerchantApplication })
  @ApiResponse({ status: 404, description: 'Application not found' })
  @ApiResponse({ status: 422, description: 'Application status does not allow edits' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateApplicationDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.update(id, dto, user);
  }

  @Post(':id/assign')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Assign a reviewer to an application' })
  @ApiResponse({ status: 200, description: 'Reviewer assigned', type: MerchantApplication })
  @ApiResponse({ status: 400, description: 'User is not a REVIEWER' })
  @ApiResponse({ status: 404, description: 'Application or reviewer not found' })
  @ApiResponse({ status: 422, description: 'Application already decided' })
  assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignReviewerDto,
  ) {
    return this.service.assignReviewer(id, dto);
  }

  @Post(':id/decision')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.REVIEWER)
  @UseGuards(ApplicationPolicyGuard)
  @RequireAssignedReviewer(true)
  @ApiOperation({ summary: 'Record a review decision (assigned reviewer only)' })
  @ApiResponse({ status: 200, description: 'Decision recorded', type: MerchantApplication })
  @ApiResponse({ status: 404, description: 'Application not found' })
  @ApiResponse({ status: 422, description: 'Invalid status transition' })
  decide(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewDecisionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.recordDecision(id, dto, user);
  }
}
