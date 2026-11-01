import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../../users/enums/role.enum';

export class LoginUserDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'admin@techkraft.com' })
  email!: string;

  @ApiProperty({ enum: Role })
  role!: Role;

  @ApiProperty()
  firstName!: string;

  @ApiProperty()
  lastName!: string;
}

export class LoginResponseDto {
  @ApiProperty({ description: 'JWT, valid for 24h' })
  accessToken!: string;

  @ApiProperty({ type: LoginUserDto })
  user!: LoginUserDto;
}

export class CurrentUserDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty({ enum: Role })
  role!: Role;
}
