// Services
export { AuthService } from './lib/services/auth.service';
export type { JwtPayload, LoginDto, RegisterDto, AuthResponse } from './lib/services/auth.service';

export { SalonService } from './lib/services/salon.service';
export type { SearchParams } from './lib/services/salon.service';

export { BookingService } from './lib/services/booking.service';
export type { CreateBookingDto, CancelBookingDto } from './lib/services/booking.service';

export { CalendarService } from './lib/services/calendar.service';
export type { CalendarAuthUrlResponse } from './lib/services/calendar.service';

export { ReviewService } from './lib/services/review.service';

export { SalonAdminService } from './lib/services/salon-admin.service';
export type { AddServiceDto, UpdateOperatingHoursDto, CreateSalonDto, CreateSalonAddressDto } from './lib/services/salon-admin.service';

export { UserService } from './lib/services/user.service';
export { AdminService } from './lib/services/admin.service';
export type {
  AdminStats,
  AdminSalon,
  AdminSalonsPage,
  AdminUser,
  AdminUsersPage,
  AdminReview,
  AdminReviewsPage,
} from './lib/services/admin.service';
export type {
  UserProfile,
  UpdateProfileDto,
  NotificationPreferences,
  ConnectedAccounts,
  ChangePasswordDto,
} from './lib/services/user.service';

export { PushNotificationService } from './lib/services/push-notification.service';

// Interceptors
export { authInterceptor } from './lib/interceptors/auth.interceptor';
