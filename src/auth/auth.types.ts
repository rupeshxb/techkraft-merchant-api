import { Role } from '../users/enums/role.enum';

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
}

/** Shape of `request.user` after JWT validation. */
export interface AuthUser {
  id: string;
  email: string;
  role: Role;
}
