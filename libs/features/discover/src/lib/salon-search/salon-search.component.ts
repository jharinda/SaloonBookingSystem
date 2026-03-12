import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  signal,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, debounceTime, Observable, of, Subject, switchMap } from 'rxjs';
import * as L from 'leaflet';

// PrimeNG
import { InputTextModule } from 'primeng/inputtext';
import { FloatLabelModule } from 'primeng/floatlabel';
import { SelectModule } from 'primeng/select';
import { ButtonModule } from 'primeng/button';
import { ChipModule } from 'primeng/chip';
import { CardModule } from 'primeng/card';
import { SelectButtonModule } from 'primeng/selectbutton';

import { Salon, SalonSearchResponse } from '@org/models';
import { SalonService, SearchParams } from '@org/shared-data-access';
import { SalonCardComponent } from '../salon-card/salon-card.component';

// ─── Leaflet icon fix ────────────────────────────────────────────────────────

const DEFAULT_ICON = L.icon({
  iconUrl:       'assets/leaflet/marker-icon.png',
  iconRetinaUrl: 'assets/leaflet/marker-icon-2x.png',
  shadowUrl:     'assets/leaflet/marker-shadow.png',
  iconSize:    [25, 41],
  iconAnchor:  [12, 41],
  popupAnchor: [1, -34],
  shadowSize:  [41, 41],
});

L.Marker.prototype.options.icon = DEFAULT_ICON;

// Default center — Colombo, Sri Lanka
const COLOMBO: L.LatLngTuple = [6.9271, 79.8612];
const DEFAULT_ZOOM = 12;

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
  encapsulation: ViewEncapsulation.None,
  imports: [
    CommonModule,
    FormsModule,
    InputTextModule,
    FloatLabelModule,
    SelectModule,
    ButtonModule,
    ChipModule,
    CardModule,
    SelectButtonModule,
    SalonCardComponent,
  ],
  templateUrl: './salon-search.component.html',
  styleUrl: './salon-search.component.scss',
})
export class SalonSearchComponent {
  // ── Services ────────────────────────────────────────────────────────────────
  private readonly salonService = inject(SalonService);

  // ── View references ──────────────────────────────────────────────────────────
  private readonly mapContainer = viewChild<ElementRef<HTMLDivElement>>('mapContainer');

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

  // ── Map state ────────────────────────────────────────────────────────────────
  private map: L.Map | null = null;
  private markers: L.Marker[] = [];
  readonly mapCenter = signal<L.LatLngTuple>(COLOMBO);
  readonly mapZoom = signal(DEFAULT_ZOOM);

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

  // ── Static options ────────────────────────────────────────────────────────────
  readonly serviceTypes = SERVICE_TYPES;
  readonly priceRanges = PRICE_RANGES;
  readonly ratingFilters = RATING_FILTERS;
  readonly cities = CITIES;
  readonly skeletonItems = Array.from({ length: 6 }, (_, i) => i);

  // Options for PrimeNG selects
  readonly serviceTypeOptions = SERVICE_TYPES.map(type => ({ label: type, value: type }));
  readonly cityOptions = CITIES.map(city => ({ label: city, value: city }));
  readonly priceRangeOptions = PRICE_RANGES.map(range => ({ label: range.label, value: range.value }));
  readonly ratingOptions = RATING_FILTERS.map(rating => ({ label: rating.label, value: rating.value }));
  readonly viewModeOptions = [
    { label: 'List', value: 'list', icon: 'pi pi-list' },
    { label: 'Map', value: 'map', icon: 'pi pi-map' },
  ];

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
        const firstResult = response.data[0];
        if (firstResult?.address?.lat && firstResult.address.lng) {
          this.mapCenter.set([firstResult.address.lat, firstResult.address.lng]);
          if (this.map) {
            this.map.setView([firstResult.address.lat, firstResult.address.lng], DEFAULT_ZOOM);
          }
        }

        // Update markers if map is visible
        if (this.viewMode() === 'map' && this.map) {
          this.updateMapMarkers();
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
        this.mapCenter.set([coords.latitude, coords.longitude]);
        if (this.map) {
          this.map.setView([coords.latitude, coords.longitude], DEFAULT_ZOOM);
        }
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
    if (mode === 'map') {
      // Initialize map if needed
      setTimeout(() => this.initializeMap(), 100);
    }
  }

  getPriceRangeLabel(value: string): string {
    const range = PRICE_RANGES.find((r) => r.value === value);
    return range?.label || '';
  }

  getRatingLabel(value: string): string {
    const rating = RATING_FILTERS.find((r) => r.value === value);
    return rating?.label || '';
  }

  // ── Private helpers ────────────────────────────────────────────────────────────

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

  // ── Map methods ────────────────────────────────────────────────────────────

  private initializeMap(): void {
    const container = this.mapContainer()?.nativeElement;
    if (!container || this.map) return;

    this.map = L.map(container, {
      center: this.mapCenter(),
      zoom: this.mapZoom(),
      zoomControl: true,
      attributionControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(this.map);

    this.updateMapMarkers();
  }

  private updateMapMarkers(): void {
    if (!this.map) return;

    // Clear existing markers
    this.markers.forEach(m => m.remove());
    this.markers = [];

    // Add markers for results with valid coordinates
    const salons = this.results().filter(s => s.address?.lat && s.address?.lng);

    salons.forEach(salon => {
      if (!salon.address?.lat || !salon.address?.lng || !this.map) return;

      const marker = L.marker([salon.address.lat, salon.address.lng])
        .addTo(this.map)
        .bindPopup(`
          <div class="salon-popup">
            <h3>${salon.name}</h3>
            <p>${salon.address.street || ''}</p>
            <p>${salon.address.city || ''}</p>
            ${salon.rating ? `<p>⭐ ${salon.rating.toFixed(1)}</p>` : ''}
          </div>
        `);

      this.markers.push(marker);
    });

    // Fit bounds if there are markers
    if (this.markers.length > 0) {
      const group = L.featureGroup(this.markers);
      this.map.fitBounds(group.getBounds(), { padding: [50, 50] });
    }
  }
}

