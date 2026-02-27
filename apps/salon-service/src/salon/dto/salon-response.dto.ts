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
  durationMinutes: number;
  category: string;
}

export class SalonImageDto {
  cloudinaryId: string;
  url: string;
  isPrimary: boolean;
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
  isApproved: boolean;
  rating: number;
  reviewCount: number;
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
