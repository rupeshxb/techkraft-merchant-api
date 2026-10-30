import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthUser } from '../../auth/auth.types';
import { Role } from '../../users/enums/role.enum';
import { RequireAssignedReviewer } from '../decorators/require-assigned-reviewer.decorator';
import { MerchantApplicationsService } from '../merchant-applications.service';

/**
 * Object-level authorization for /applications/:id routes.
 * Reads the request from the ExecutionContext rather than injecting REQUEST,
 * which would make the guard (and its controller) request-scoped.
 */
@Injectable()
export class ApplicationPolicyGuard implements CanActivate {
  constructor(
    private readonly applications: MerchantApplicationsService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      user: AuthUser;
      params: { id: string };
    }>();
    const { user } = request;

    if (user.role === Role.ADMIN) {
      return true;
    }

    // Throws NotFoundException when the application does not exist.
    const application = await this.applications.findEntity(request.params.id);

    if (user.role === Role.SALES && application.createdBy.id !== user.id) {
      throw new ForbiddenException('You do not have access to this application');
    }

    const needsAssignedReviewer = this.reflector.get(
      RequireAssignedReviewer,
      context.getHandler(),
    );
    if (
      user.role === Role.REVIEWER &&
      needsAssignedReviewer &&
      application.assignedReviewer?.id !== user.id
    ) {
      throw new ForbiddenException(
        'Only the assigned reviewer can record a decision',
      );
    }

    return true;
  }
}
