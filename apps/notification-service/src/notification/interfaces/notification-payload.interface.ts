/** Shape of a single booked service inside a job payload */
export interface BookedServicePayload {
  serviceId: string;
  name: string;
  price: number;
  durationMinutes: number;
}

/** Core booking information shared by all notification events */
export interface BookingPayload {
  id: string;
  clientId: string;
  salonId: string;
  stylistId?: string;
  services: BookedServicePayload[];
  appointmentDate: string; // ISO-8601
  startTime: string;       // HH:mm
  endTime: string;         // HH:mm
  totalPrice: number;
  notes?: string;
  cancellationReason?: string;
  cancelledBy?: string;
}

/** Enriched recipient information resolved by the processor (e.g. from auth/salon service or embedded in payload) */
export interface RecipientInfo {
  name: string;
  email: string;
  phone: string; // E.164 format e.g. +94771234567
}

/** Full job payload sent by booking-service / scheduler */
export interface BookingNotificationPayload {
  booking: BookingPayload;
  client: RecipientInfo;
  salonOwner: RecipientInfo;
  salonName: string;
  salonAddress: string;
}
