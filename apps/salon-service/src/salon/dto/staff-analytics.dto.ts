export interface TopServiceDto {
  serviceName: string;
  count: number;
}

export interface AppointmentByMonthDto {
  month: string; // YYYY-MM
  count: number;
}

export interface StaffAnalyticsItemDto {
  stylistId: string;
  name: string;
  avatarUrl?: string;
  totalAppointments: number;
  completedAppointments: number;
  cancellationRate: number;
  averageRating: number;
  totalReviews: number;
  revenueGenerated: number;
  topServices: TopServiceDto[];
  appointmentsByMonth: AppointmentByMonthDto[];
}

export interface StaffAnalyticsResponseDto {
  salonId: string;
  staff: StaffAnalyticsItemDto[];
  generatedAt: Date;
}
