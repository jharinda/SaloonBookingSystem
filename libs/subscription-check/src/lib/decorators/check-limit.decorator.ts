import { SetMetadata } from '@nestjs/common';
import { LimitType } from '../interfaces/subscription-check.interface';

export const CHECK_LIMIT_KEY = 'check_limit';
export const CheckLimit = (limitType: LimitType) => SetMetadata(CHECK_LIMIT_KEY, limitType);
