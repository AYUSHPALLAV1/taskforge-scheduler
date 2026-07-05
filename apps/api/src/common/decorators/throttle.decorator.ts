import { SetMetadata } from '@nestjs/common';
export const THROTTLE_KEY = 'throttle';
export const Throttle = (limit: number, windowMs: number) => SetMetadata(THROTTLE_KEY, { limit, windowMs });
