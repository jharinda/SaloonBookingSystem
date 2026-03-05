import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, debounceTime, Observable, of, Subject, switchMap } from 'rxjs';

import { Button } from 'primeng/button';
import { InputText } from 'primeng/inputtext';
import { Select } from 'primeng/select';

import { Salon, SalonSearchResponse } from '@org/models';
import { SalonService, SearchParams } from '../services/salon.service';
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

const CITIES = [
  'Colombo',
  'Kandy',
  'Galle',
  'Negombo',
  'Matara',
  'Jaffna',
  'Trincomalee',
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
}

// ─── Component ────────────────────────────────────────────────────────────────

@Component({
  selector: 'lib-salon-search',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    Button,
    InputText,
    Select,
    SalonCardComponent,
  ],
  template: `
    <div class="discover-container">

      <!-- ── Hero ────────────────────────────────────────────────────────────── -->
      <header class="discover-header">
        <h1 class="discover-title">Find Your Perfect Salon</h1>
        <p class="discover-subtitle">
          Discover top-rated salons and book appointments instantly
        </p>
        <!-- Search input -->
        <div class="flex justify-center mt-7 w-full">
          <span class="p-input-icon-left w-full max-w-xl">
            <i class="pi pi-search"></i>
            <input
              pInputText
              type="search"
              placeholder="Search salons or services…"
              autocomplete="off"
              class="w-full"
              [ngModel]="searchTerm()"
              (ngModelChange)="onSearchInput($event)"
              (keydown.enter)="triggerSearchImmediate()"
              aria-label="Search salons or services"
            />
          </span>
        </div>
      </header>

      <!-- ── Filter & search toolbar ─────────────────────────────────────── -->
      <div class="flex flex-wrap items-center gap-4 bg-gray-50 dark:bg-zinc-800 border border-transparent dark:border-zinc-700 rounded-xl px-5 py-4 mb-8">
        <p-select
          [options]="serviceTypeOptions"
          [ngModel]="filters().serviceType"
          (ngModelChange)="onServiceTypeChange($event)"
          optionLabel="label"
          optionValue="value"
          placeholder="All service types"
          styleClass="w-full"
          class="flex-1 min-w-[160px]"
        />
        <p-select
          [options]="cityOptions"
          [ngModel]="filters().city"
          (ngModelChange)="onCityChange($event)"
          optionLabel="label"
          optionValue="value"
          placeholder="All cities"
          styleClass="w-full"
          class="flex-1 min-w-[140px]"
        />
        <p-button
          label="Search"
          icon="pi pi-search"
          (onClick)="triggerSearchImmediate()"
          [disabled]="isLoading()"
          aria-label="Search salons"
        />
        <p-button
          label="Near Me"
          icon="pi pi-map-marker"
          variant="outlined"
          [disabled]="geoLoading()"
          (onClick)="onNearMe()"
          aria-label="Search near my location"
        />
        @if (hasActiveFilters()) {
          <p-button
            label="Clear"
            icon="pi pi-times"
            variant="outlined"
            severity="secondary"
            (onClick)="clearFilters()"
            aria-label="Clear all filters"
          />
        }
      </div>

      <!-- ── All Salons (initial load) ───────────────────────────────────────── -->
      @if (!hasActiveFilters() && !hasSearched() && !isLoading()) {
        <section class="mb-10" aria-label="All salons">
          <h2 class="flex items-center gap-2 text-xl font-bold text-gray-900 dark:text-white mb-5">
            <i class="pi pi-storefront text-purple-500"></i>
            All Salons
          </h2>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            @for (salon of featuredSalons(); track salon._id) {
              <lib-salon-card [salon]="salon" />
            }
          </div>
        </section>
      }

      <!-- ── Loading — skeleton grid ───────────────────────────────────────── -->
      @if (isLoading()) {
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" aria-label="Loading salons…" aria-busy="true">
          @for (item of skeletonItems; track item) {
            <div class="skeleton-card" aria-hidden="true">
              <div class="skeleton-block skeleton-image"></div>
              <div class="skeleton-body">
                <div class="skeleton-block skeleton-title"></div>
                <div class="skeleton-block skeleton-subtitle"></div>
                <div class="skeleton-block skeleton-line"></div>
                <div class="skeleton-block skeleton-line skeleton-line--short"></div>
                <div class="skeleton-block skeleton-line"></div>
                <div class="skeleton-block skeleton-btn"></div>
              </div>
            </div>
          }
        </div>
      }

      <!-- ── Results ───────────────────────────────────────────────────────── -->
      @if (!isLoading() && results().length > 0) {
        <div class="results-meta">
          <span>
            {{ results().length }}
            {{ results().length === 1 ? 'salon' : 'salons' }} found
          </span>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          @for (salon of results(); track salon._id) {
            <lib-salon-card [salon]="salon" />
          }
        </div>
      }

      <!-- ── Empty state ───────────────────────────────────────────────────── -->
      @if (!isLoading() && hasSearched() && results().length === 0 && !error()) {
        <div class="flex flex-col items-center text-center py-16 gap-4" role="status">
          <i class="pi pi-search text-5xl text-gray-300 dark:text-zinc-600"></i>
          <h2 class="text-xl font-semibold text-gray-700 dark:text-gray-200 m-0">No salons found</h2>
          <p class="max-w-md text-gray-500 dark:text-gray-400 text-sm m-0">
            We couldn&apos;t find any salons matching
            <strong>{{ activeQuery() }}</strong>.
            Try a different search term or adjust your filters.
          </p>
          <p-button label="Clear filters" variant="outlined" (onClick)="clearFilters()" />
        </div>
      }

      <!-- ── Error state ────────────────────────────────────────────────────── -->
      @if (!isLoading() && error()) {
        <div class="flex flex-col items-center text-center py-16 gap-4" role="alert">
          <i class="pi pi-exclamation-circle text-5xl text-red-400"></i>
          <h2 class="text-xl font-semibold text-gray-700 dark:text-gray-200 m-0">Something went wrong</h2>
          <p class="max-w-md text-gray-500 dark:text-gray-400 text-sm m-0">{{ error() }}</p>
          <p-button label="Try again" icon="pi pi-refresh" (onClick)="retrySearch()" />
        </div>
      }



    </div>
  `,
  styles: [`
    /* ── Layout ─────────────────────────────────────────────────────────────── */

    .discover-container {
      max-width: 1280px;
      margin: 0 auto;
      padding: 32px 24px 64px;
    }

    /* ── Header ──────────────────────────────────────────────────────────────── */

    .discover-header {
      text-align: center;
      margin-bottom: 40px;
    }

    .discover-title {
      font-size: clamp(1.75rem, 4vw, 2.5rem);
      font-weight: 700;
      margin: 0 0 10px;
      color: #1a1a2e;
    }

    .discover-subtitle {
      font-size: 1.05rem;
      color: #5f6368;
      margin: 0;
    }

    /* ── Filter bar ──────────────────────────────────────────────────────────── */

    .filter-bar {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      align-items: flex-start;
      background: #f8f9fa;
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 32px;
    }

    .filter-field {
      flex: 1 1 180px;
      min-width: 160px;
    }

    .clear-btn {
      margin-top: 4px;
      align-self: center;
    }

    /* ── Results meta ────────────────────────────────────────────────────────── */

    .results-meta {
      font-size: 0.9rem;
      color: #6b7280;
      margin-bottom: 16px;
    }

    /* ── Results grid ────────────────────────────────────────────────────────── */

    .results-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 20px;
    }

    /* ── Skeleton cards ──────────────────────────────────────────────────────── */

    @keyframes shimmer {
      0%   { background-position: -600px 0; }
      100% { background-position:  600px 0; }
    }

    .skeleton-card {
      border-radius: 12px;
      overflow: hidden;
      border: 1px solid #e5e7eb;
      background: #fff;
    }

    .skeleton-block {
      border-radius: 6px;
      background: linear-gradient(
        90deg,
        #f0f0f0 25%,
        #e0e0e0 50%,
        #f0f0f0 75%
      );
      background-size: 1200px 100%;
      animation: shimmer 1.5s infinite linear;
    }

    .skeleton-image {
      width: 100%;
      aspect-ratio: 16 / 9;
      border-radius: 0;
    }

    .skeleton-body {
      padding: 14px 16px 16px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .skeleton-title  { height: 18px; width: 65%; }
    .skeleton-subtitle { height: 14px; width: 45%; }
    .skeleton-line   { height: 13px; width: 90%; }
    .skeleton-line--short { width: 55%; }
    .skeleton-btn    { height: 36px; width: 110px; border-radius: 18px; margin-top: 4px; align-self: flex-end; }

    /* ── State panels ────────────────────────────────────────────────────────── */

    .state-panel {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      padding: 64px 24px;
      gap: 14px;
    }

    .state-icon {
      font-size: 56px;
      width: 56px;
      height: 56px;
      color: #d1d5db;
    }

    .state-icon--error {
      color: #ef4444;
    }

    .state-title {
      font-size: 1.25rem;
      font-weight: 600;
      margin: 0;
      color: #374151;
    }

    .state-message {
      max-width: 420px;
      font-size: 0.95rem;
      color: #6b7280;
      margin: 0;
      line-height: 1.6;
    }

    /* ── Hero search bar ─────────────────────────────────────────────────────── */

    .hero-search-bar {
      display: flex;
      align-items: center;
      background: #fff;
      border-radius: 50px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.1);
      padding: 6px 6px 6px 20px;
      margin-top: 28px;
      max-width: 680px;
      width: 100%;
      margin-left: auto;
      margin-right: auto;
    }

    .hero-search-icon {
      color: #9ca3af;
      flex-shrink: 0;
      margin-right: 8px;
    }

    .hero-search-input {
      flex: 1;
      border: none;
      outline: none;
      font-size: 1rem;
      background: transparent;
      color: #1f2937;
      min-width: 0;
      &::placeholder { color: #9ca3af; }
    }

    .hero-search-btn {
      border-radius: 40px;
      padding: 0 24px;
      height: 44px;
      flex-shrink: 0;
      font-weight: 600;
    }

    /* ── Near Me button ──────────────────────────────────────────────────────── */

    .near-me-btn {
      align-self: center;
      margin-top: 4px;
      display: flex;
      align-items: center;
      gap: 4px;
    }

    /* ── Featured section ────────────────────────────────────────────────────── */

    .featured-section {
      margin-bottom: 40px;
    }

    .section-heading {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 1.2rem;
      font-weight: 700;
      margin: 0 0 20px;
      color: #1a1a2e;
    }

    .section-icon {
      color: var(--mat-sys-primary, #6750A4);
    }

    /* ── Responsive ──────────────────────────────────────────────────────────── */

    @media (max-width: 640px) {
      .discover-container { padding: 20px 16px 40px; }
      .filter-field { flex: 1 1 100%; }
      .near-me-btn { flex: 1 1 100%; justify-content: center; }
      .results-grid { grid-template-columns: 1fr; }
      .hero-search-bar { flex-wrap: wrap; border-radius: 16px; padding: 12px; gap: 8px; }
      .hero-search-input { width: 100%; }
      .hero-search-btn { width: 100%; border-radius: 12px; }
    }

    /* ── Dark mode overrides ─────────────────────────────────────────────────── */

    :host-context(.dark) .discover-title,
    :host-context(.app-dark) .discover-title {
      color: #f4f4f5;
    }

    :host-context(.dark) .discover-subtitle,
    :host-context(.app-dark) .discover-subtitle {
      color: #a1a1aa;
    }

    :host-context(.dark) .skeleton-card,
    :host-context(.app-dark) .skeleton-card {
      background: #18181b;
      border-color: #3f3f46;
    }

    :host-context(.dark) .skeleton-block,
    :host-context(.app-dark) .skeleton-block {
      background: linear-gradient(
        90deg,
        #27272a 25%,
        #3f3f46 50%,
        #27272a 75%
      );
      background-size: 1200px 100%;
    }

    :host-context(.dark) .results-meta,
    :host-context(.app-dark) .results-meta {
      color: #a1a1aa;
    }

    :host-context(.dark) .section-heading,
    :host-context(.app-dark) .section-heading {
      color: #f4f4f5;
    }
  `],
})
export class SalonSearchComponent {
  // ── Services ────────────────────────────────────────────────────────────────
  private readonly salonService = inject(SalonService);

  // ── State (signals) ──────────────────────────────────────────────────────────
  readonly searchTerm = signal('');
  readonly filters = signal<SearchFilters>({ serviceType: '', city: '' });
  readonly results = signal<Salon[]>([]);
  readonly isLoading = signal(false);
  readonly hasSearched = signal(false);
  readonly error = signal<string | null>(null);
  readonly featuredSalons = signal<Salon[]>([]);
  readonly geoLoading = signal(false);

  // ── Derived ──────────────────────────────────────────────────────────────────
  readonly hasActiveFilters = computed(
    () => !!this.searchTerm() || !!this.filters().serviceType || !!this.filters().city,
  );

  /** Human-readable description of the current query for the empty-state message */
  readonly activeQuery = computed(() => {
    const parts: string[] = [];
    if (this.searchTerm())            parts.push(`"${this.searchTerm()}"`);
    if (this.filters().serviceType)   parts.push(this.filters().serviceType);
    if (this.filters().city)          parts.push(this.filters().city);
    return parts.join(', ') || 'your search';
  });

  // ── Static options ────────────────────────────────────────────────────────────
  readonly serviceTypes = SERVICE_TYPES;
  readonly cities = CITIES;
  readonly skeletonItems = Array.from({ length: 6 }, (_, i) => i);
  /** Option arrays for PrimeNG Select */
  readonly serviceTypeOptions = [
    { label: 'All service types', value: '' },
    ...SERVICE_TYPES.map((t) => ({ label: t, value: t })),
  ];
  readonly cityOptions = [
    { label: 'All cities', value: '' },
    ...CITIES.map((c) => ({ label: c, value: c })),
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

  // Navigation is handled by SalonCardComponent directly.

  clearFilters(): void {
    this.searchTerm.set('');
    this.filters.set({ serviceType: '', city: '' });
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
        const query: SearchParams = {
          lat:     coords.latitude,
          lng:     coords.longitude,
          q:       this.searchTerm() || undefined,
          service: this.filters().serviceType || undefined,
          city:    this.filters().city || undefined,
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

  /** Fires immediately (used by the hero button and Enter key). */
  triggerSearchImmediate(): void {
    if (!this.searchTerm() && !this.filters().serviceType && !this.filters().city) return;
    const query: SearchParams = {
      q:       this.searchTerm() || undefined,
      service: this.filters().serviceType || undefined,
      city:    this.filters().city || undefined,
    };
    this.lastQuery = query;
    this.searchTrigger$.next(query);
  }

  private triggerSearch(): void {
    const query: SearchParams = {
      q:       this.searchTerm() || undefined,
      service: this.filters().serviceType || undefined,
      city:    this.filters().city || undefined,
    };
    this.searchTrigger$.next(query);
  }
}
