export class SalonAddressDto {
  street: string;
  city: string;
  province: string;
  lat: number;
  lng: number;
}

export class SalonOperatingHoursDto {
  day: number;
  open: string;
  close: string;
  closed: boolean;
}

export class SalonServiceItemDto {
  id: string;
  name: string;
  description?: string;
  price: number;
  /** Duration in minutes — matches the frontend SalonServiceItem.duration field */
  duration: number;
  category: string;
  active: boolean;
}

export class SalonImageDto {
  cloudinaryId: string;
  url: string;
  isPrimary: boolean;
}

export class SalonStationDto {
  _id: string;
  name: string;
  isActive: boolean;
}

export class SalonResponseDto {
  id: string;
  name: string;
  description?: string;
  phone: string;
  email: string;
  ownerId: string;
  franchiseId?: string;
  address: SalonAddressDto;
  operatingHours: SalonOperatingHoursDto[];
  services: SalonServiceItemDto[];
  staff: string[];
  images: SalonImageDto[];
  stations: SalonStationDto[];
  stationCount: number;
  isApproved: boolean;
  isActive: boolean;
  rejectionReason?: string;
  subscriptionStatus: 'trial' | 'active' | 'past_due' | 'cancelled';
  rating: number;
  reviewCount: number;
  cancellationWindowHours: number;
  autoConfirmBookings: boolean;
  breakLimits: { LUNCH: number; COFFEE: number; PERSONAL: number; OTHER: number };
  createdAt: Date;
  updatedAt: Date;
}

export class PaginatedSalonsDto {
  data: SalonResponseDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export class SalonSearchResultDto {
  salons: SalonResponseDto[];
  total: number;
  page: number;
  totalPages: number;
}
