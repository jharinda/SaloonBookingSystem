import type { Booking } from '@org/models';

/** Response from GET /api/bookings and GET /api/bookings/stylist/me when paginated */
export interface PaginatedBookingsPage {
  data: Booking[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
