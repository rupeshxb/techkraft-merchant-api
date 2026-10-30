import { Reflector } from '@nestjs/core';

/** Marks a handler that only the application's assigned reviewer may call. */
export const RequireAssignedReviewer = Reflector.createDecorator<boolean>();
