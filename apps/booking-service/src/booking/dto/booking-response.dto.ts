import { BookingStatus } from '../schemas/booking.schema';

export class BookedServiceResponseDto {
  serviceId: string;
  name: string;
  price: number;
  durationMinutes: number;
}

export class BookingResponseDto {
  id: string;
  /** Same as id — added so Angular models using _id work out of the box */
  _id: string;
  clientId: string;
  /** Denormalised client name stored at booking time */
  clientName: string;
  salonId: string;
  stylistId?: string;
  /** Denormalised salon name stored at booking time */
  salonName: string;
  /** Name of the first (primary) service — convenience field */
  serviceName: string;
  services: BookedServiceResponseDto[];
  appointmentDate: Date;
  startTime: string;
  endTime: string;
  status: BookingStatus;
  totalPrice: number;
  notes?: string;
  googleEventId?: string;
  cancelledBy?: string;
  cancellationReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

export class AvailableSlotsResponseDto {
  salonId: string;
  date: string;
  slots: string[]; // e.g. ['09:00', '09:30', ...]
}

export class PaginatedBookingsDto {
  data: BookingResponseDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
