/**
 * Re-export the canonical BookingService from shared-data-access.
 * Kept for backwards-compatibility with any in-feature imports.
 */
export { BookingService } from '@org/shared-data-access';
export type { CreateBookingDto, CancelBookingDto } from '@org/shared-data-access';
