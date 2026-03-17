// Services
export { AuthService } from './lib/services/auth.service';
export type { JwtPayload, LoginDto, RegisterDto, AuthResponse } from './lib/services/auth.service';

export { SalonService } from './lib/services/salon.service';
export type { SearchParams, SalonStaffDto } from './lib/services/salon.service';

export { BookingService } from './lib/services/booking.service';
export type { CreateBookingDto, CancelBookingDto } from './lib/services/booking.service';

export { CalendarService } from './lib/services/calendar.service';
export type { CalendarAuthUrlResponse } from './lib/services/calendar.service';

export { ReviewService } from './lib/services/review.service';
export type { CreateReviewDto, UploadReviewImageResult } from '@org/models';

export { SalonAdminService } from './lib/services/salon-admin.service';
export type { AddServiceDto, UpdateOperatingHoursDto, CreateSalonDto, CreateSalonAddressDto, UpdateSalonInfoDto, SalonImage, UploadImageResult, Station, SalonStaffMember, StylistSearchResult, JoinRequestDto, SentInvitationDto } from './lib/services/salon-admin.service';

export { UserService } from './lib/services/user.service';
export type { SalonInvitationDto } from './lib/services/user.service';
export type { UpdateStylistProfileDto, SpecialtyDto } from './lib/services/user.service';
export type { StylistBreakDto, CreateStylistBreakPayload, BreakType } from './lib/services/user.service';

export { CurrencyService } from './lib/services/currency.service';

export { AppCurrencyPipe } from './lib/pipes/app-currency.pipe';

export { ChatService } from './lib/services/chat.service';
export type { ConversationResponse, MessageResponse, PaginatedMessagesResponse } from './lib/services/chat.service';
export { AdminService } from './lib/services/admin.service';
export type {
  AdminStats,
  AdminSalon,
  AdminSalonsPage,
  AdminUser,
  AdminUsersPage,
  AdminReview,
  AdminReviewsPage,
  AdminSpecialty,
  CreateSpecialtyDto,
} from './lib/services/admin.service';
export type {
  UserProfile,
  UpdateProfileDto,
  NotificationPreferences,
  ConnectedAccounts,
  ChangePasswordDto,
} from './lib/services/user.service';

export { PushNotificationService, FCM_CONFIG } from './lib/services/push-notification.service';
export type { FCMConfig } from './lib/services/push-notification.service';
export { RealtimeNotificationService } from './lib/services/realtime-notification.service';
export type { RealtimeNotification } from './lib/services/realtime-notification.service';
export { ActiveChatService } from './lib/services/active-chat.service';

// Interceptors
export { authInterceptor } from './lib/interceptors/auth.interceptor';
