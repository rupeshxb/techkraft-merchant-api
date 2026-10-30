import { PartialType } from '@nestjs/swagger';
import { CreateApplicationDto } from './create-application.dto';

/** Only accepted while the application is PENDING or INFO_REQUESTED. */
export class UpdateApplicationDto extends PartialType(CreateApplicationDto) {}
