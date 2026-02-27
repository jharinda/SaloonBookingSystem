import { BookingStatus } from '../schemas/booking.schema';

export class BookedServiceResponseDto {
  serviceId: string;
  name: string;
  price: number;
  durationMinutes: number;
}

export class BookingResponseDto {
  id: string;
  clientId: string;
  salonId: string;
  stylistId?: string;
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
