import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, debounceTime, Observable, of, Subject, switchMap } from 'rxjs';

// Angular Material
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

// Google Maps
import { GoogleMapsModule } from '@angular/google-maps';

import { Salon, SalonSearchResponse } from '@org/models';
import { SalonService, SearchParams } from '@org/shared-data-access';
import { SalonCardComponent } from '../salon-card/salon-card.component';

// ─── Static filter options ────────────────────────────────────────────────────

const SERVICE_TYPES = [
  'Hair Cut & Style',
  'Hair Colouring',
  'Manicure & Pedicure',
  'Facial & Skin Care',
  'Waxing',
  'Massage',
  'Makeup',
  'Beard & Shave',
  'Bridal',
  'Eyebrows & Lashes',
] as const;

const PRICE_RANGES = [
  { label: 'Under ₨2,000', value: '0-2000', min: 0, max: 2000 },
  { label: '₨2,000 - ₨5,000', value: '2000-5000', min: 2000, max: 5000 },
  { label: '₨5,000 - ₨10,000', value: '5000-10000', min: 5000, max: 10000 },
  { label: 'Over ₨10,000', value: '10000+', min: 10000, max: 999999 },
] as const;

const RATING_FILTERS = [
  { label: '4+ Stars', value: '4', min: 4 },
  { label: '3+ Stars', value: '3', min: 3 },
  { label: 'Any Rating', value: '0', min: 0 },
] as const;

const CITIES = [
  'Colombo',
  'Kandy',
  'Galle',
  'Negombo',
  'Matara',
  'Jaffna',
  'Trincomale',
  'Batticaloa',
  'Kurunegala',
  'Ratnapura',
  'Anuradhapura',
  'Badulla',
] as const;

// ─── Internal types ───────────────────────────────────────────────────────────

interface SearchFilters {
  serviceType: string;
  city: string;
  priceRange: string;
  rating: string;
}

type ViewMode = 'list' | 'map';

// ─── Component ────────────────────────────────────────────────────────────────

@Component({
  selector: 'lib-salon-search',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatButtonModule,
    MatChipsModule,
    MatSelectModule,
    MatButtonToggleModule,
    MatCardModule,
    MatProgressSpinnerModule,
    GoogleMapsModule,
    SalonCardComponent,
  ],
  templateUrl: './salon-search.component.html',
  styleUrl: './salon-search.component.scss',
})
export class SalonSearchComponent {
  // ── Services ────────────────────────────────────────────────────────────────
  private readonly salonService = inject(SalonService);

  // ── State (signals) ──────────────────────────────────────────────────────────
  readonly searchTerm = signal('');
  readonly filters = signal<SearchFilters>({
    serviceType: '',
    city: '',
    priceRange: '',
    rating: '0',
  });
  readonly results = signal<Salon[]>([]);
  readonly isLoading = signal(false);
  readonly hasSearched = signal(false);
  readonly error = signal<string | null>(null);
  readonly featuredSalons = signal<Salon[]>([]);
  readonly geoLoading = signal(false);
  readonly viewMode = signal<ViewMode>('list');

  // ── Map state ───────────────────────────────────────────────────────────────
  readonly mapCenter = signal<google.maps.LatLngLiteral>({ lat: 6.9271, lng: 79.8612 }); // Colombo
  readonly mapZoom = signal(12);
  readonly mapOptions: google.maps.MapOptions = {
    disableDefaultUI: false,
    zoomControl: true,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: true,
  };

  // ── Derived ──────────────────────────────────────────────────────────────────
  readonly hasActiveFilters = computed(
    () =>
      !!this.searchTerm() ||
      !!this.filters().serviceType ||
      !!this.filters().city ||
      !!this.filters().priceRange ||
      (this.filters().rating !== '0' && !!this.filters().rating),
  );

  readonly activeFilterCount = computed(() => {
    let count = 0;
    if (this.searchTerm()) count++;
    if (this.filters().serviceType) count++;
    if (this.filters().city) count++;
    if (this.filters().priceRange) count++;
    if (this.filters().rating && this.filters().rating !== '0') count++;
    return count;
  });

  readonly activeQuery = computed(() => {
    const parts: string[] = [];
    if (this.searchTerm()) parts.push(`"${this.searchTerm()}"`);
    if (this.filters().serviceType) parts.push(this.filters().serviceType);
    if (this.filters().city) parts.push(this.filters().city);
    if (this.filters().priceRange) {
      const range = PRICE_RANGES.find((r) => r.value === this.filters().priceRange);
      if (range) parts.push(range.label);
    }
    if (this.filters().rating && this.filters().rating !== '0') {
      const rating = RATING_FILTERS.find((r) => r.value === this.filters().rating);
      if (rating) parts.push(rating.label);
    }
    return parts.join(', ') || 'your search';
  });

  readonly mapMarkers = computed(() =>
    this.results()
      .filter((s) => s.address?.lat && s.address?.lng)
      .map((s) => ({
        position: { lat: s.address!.lat!, lng: s.address!.lng! },
        title: s.name,
        salon: s,
      })),
  );

  // ── Static options ────────────────────────────────────────────────────────────
  readonly serviceTypes = SERVICE_TYPES;
  readonly priceRanges = PRICE_RANGES;
  readonly ratingFilters = RATING_FILTERS;
  readonly cities = CITIES;
  readonly skeletonItems = Array.from({ length: 6 }, (_, i) => i);

  // ── RxJS pipeline (debounced search) ─────────────────────────────────────────
  private readonly searchTrigger$ = new Subject<SearchParams>();
  private lastQuery: SearchParams = {};

  constructor() {
    this.searchTrigger$
      .pipe(
        debounceTime(300),
        switchMap((query): Observable<SalonSearchResponse> => {
          this.isLoading.set(true);
          this.error.set(null);
          this.lastQuery = query;
          return this.salonService.searchSalons(query).pipe(
            catchError((): Observable<SalonSearchResponse> => {
              this.error.set('Failed to load salons. Please check your connection and try again.');
              return of({ data: [], total: 0, page: 1, limit: 20 });
            }),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((response) => {
        this.results.set(response.data);
        this.isLoading.set(false);
        this.hasSearched.set(true);

        // Center map on first result if available
        if (response.data.length > 0 && response.data[0].address?.lat && response.data[0].address?.lng) {
          this.mapCenter.set({
            lat: response.data[0].address.lat,
            lng: response.data[0].address.lng,
          });
        }
      });

    this.loadAllSalons();
  }

  // ── Event handlers ────────────────────────────────────────────────────────────

  onSearchInput(value: string): void {
    this.searchTerm.set(value);
    this.triggerSearch();
  }

  onServiceTypeChange(value: string): void {
    this.filters.update((f) => ({ ...f, serviceType: value }));
    this.triggerSearch();
  }

  onCityChange(value: string): void {
    this.filters.update((f) => ({ ...f, city: value }));
    this.triggerSearch();
  }

  onPriceRangeChange(value: string): void {
    this.filters.update((f) => ({ ...f, priceRange: value }));
    this.triggerSearch();
  }

  onRatingChange(value: string): void {
    this.filters.update((f) => ({ ...f, rating: value }));
    this.triggerSearch();
  }

  removeFilter(filterType: keyof SearchFilters): void {
    if (filterType === 'serviceType' || filterType === 'city' || filterType === 'priceRange') {
      this.filters.update((f) => ({ ...f, [filterType]: '' }));
    } else if (filterType === 'rating') {
      this.filters.update((f) => ({ ...f, rating: '0' }));
    }
    this.triggerSearch();
  }

  removeSearchTerm(): void {
    this.searchTerm.set('');
    this.triggerSearch();
  }

  clearFilters(): void {
    this.searchTerm.set('');
    this.filters.set({ serviceType: '', city: '', priceRange: '', rating: '0' });
    this.results.set([]);
    this.hasSearched.set(false);
    this.error.set(null);
    this.loadAllSalons();
  }

  retrySearch(): void {
    this.error.set(null);
    this.searchTrigger$.next(this.lastQuery);
  }

  onNearMe(): void {
    if (!navigator.geolocation) {
      this.error.set('Geolocation is not supported by your browser.');
      return;
    }
    this.geoLoading.set(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        this.geoLoading.set(false);
        this.mapCenter.set({ lat: coords.latitude, lng: coords.longitude });
        const query: SearchParams = {
          lat: coords.latitude,
          lng: coords.longitude,
          q: this.searchTerm() || undefined,
          service: this.filters().serviceType || undefined,
          city: this.filters().city || undefined,
        };
        this.lastQuery = query;
        this.searchTrigger$.next(query);
      },
      () => {
        this.geoLoading.set(false);
        this.error.set('Location access denied. Please enable location permissions and try again.');
      },
    );
  }

  toggleViewMode(mode: ViewMode): void {
    this.viewMode.set(mode);
  }

  onMarkerClick(salon: Salon): void {
    // Could open salon detail or show info window
    console.log('Marker clicked:', salon.name);
  }

  getPriceRangeLabel(value: string): string {
    const range = PRICE_RANGES.find((r) => r.value === value);
    return range?.label || '';
  }

  getRatingLabel(value: string): string {
    const rating = RATING_FILTERS.find((r) => r.value === value);
    return rating?.label || '';
  }

  private loadAllSalons(): void {
    this.isLoading.set(true);
    this.salonService.getFeaturedSalons().subscribe({
      next: (salons) => {
        this.featuredSalons.set(salons);
        this.isLoading.set(false);
      },
      error: () => {
        this.isLoading.set(false);
      },
    });
  }

  // ── Private helpers ────────────────────────────────────────────────────────────

  triggerSearchImmediate(): void {
    if (!this.searchTerm() && !this.hasActiveFilters()) return;
    const query: SearchParams = {
      q: this.searchTerm() || undefined,
      service: this.filters().serviceType || undefined,
      city: this.filters().city || undefined,
    };
    this.lastQuery = query;
    this.searchTrigger$.next(query);
  }

  private triggerSearch(): void {
    const query: SearchParams = {
      q: this.searchTerm() || undefined,
      service: this.filters().serviceType || undefined,
      city: this.filters().city || undefined,
    };
    this.searchTrigger$.next(query);
  }
}

