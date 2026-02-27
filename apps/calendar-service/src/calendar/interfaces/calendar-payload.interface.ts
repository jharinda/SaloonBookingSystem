export interface BookedServicePayload {
  serviceId: string;
  name: string;
  price: number;
  durationMinutes: number;
}

export interface RecipientInfo {
  name: string;
  email: string;
  phone: string;
}

export interface BookingPayload {
  id: string;
  clientId: string;
  salonId: string;
  stylistId?: string;
  services: BookedServicePayload[];
  appointmentDate: string; // ISO-8601 date string
  startTime: string;       // HH:mm
  endTime: string;         // HH:mm
  totalPrice: number;
  notes?: string;
  googleEventId?: string;
  cancellationReason?: string;
  cancelledBy?: string;
}

export interface CalendarJobPayload {
  booking: BookingPayload;
  client: RecipientInfo;
  salonOwner: RecipientInfo;
  salonName: string;
  salonAddress: string;
}
