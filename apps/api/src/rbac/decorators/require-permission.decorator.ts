import { SetMetadata } from '@nestjs/common';

export const PERMISSION_KEY = 'required_permission';

// Usage: @RequirePermission('queue:pause')
export const RequirePermission = (...permissions: string[]) =>
  SetMetadata(PERMISSION_KEY, permissions);

export const CurrentUser = () => {
  const { createParamDecorator, ExecutionContext } = require('@nestjs/common');
  return createParamDecorator((_: unknown, ctx: typeof ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  })();
};
