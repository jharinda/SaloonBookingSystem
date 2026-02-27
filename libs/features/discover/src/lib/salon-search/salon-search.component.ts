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

import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';

import { Salon, SalonSearchResponse } from '@org/models';
import { SalonService, SearchParams } from '../services/salon.service';
import { SalonCardComponent } from '../salon-card/salon-card.component';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

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
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatProgressSpinnerModule,
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
        <div class="hero-search-bar">
          <mat-icon class="hero-search-icon">search</mat-icon>
          <input
            class="hero-search-input"
            type="search"
            placeholder="Search salons or services…"
            autocomplete="off"
            [ngModel]="searchTerm()"
            (ngModelChange)="onSearchInput($event)"
            (keydown.enter)="triggerSearchImmediate()"
            aria-label="Search salons or services"
          />
          <button
            mat-flat-button
            color="primary"
            class="hero-search-btn"
            (click)="triggerSearchImmediate()"
            [disabled]="isLoading()"
          >
            Find a Salon
          </button>
        </div>
      </header>

      <!-- ── Filter row ────────────────────────────────────────────────────── -->
      <div class="filter-bar">
        <mat-form-field appearance="outline" class="filter-field">
          <mat-label>Service type</mat-label>
          <mat-select
            [ngModel]="filters().serviceType"
            (ngModelChange)="onServiceTypeChange($event)"
          >
            <mat-option value="">All services</mat-option>
            @for (type of serviceTypes; track type) {
              <mat-option [value]="type">{{ type }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline" class="filter-field">
          <mat-label>City</mat-label>
          <mat-select
            [ngModel]="filters().city"
            (ngModelChange)="onCityChange($event)"
          >
            <mat-option value="">All cities</mat-option>
            @for (city of cities; track city) {
              <mat-option [value]="city">{{ city }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <button
          mat-stroked-button
          class="near-me-btn"
          [disabled]="geoLoading()"
          (click)="onNearMe()"
          aria-label="Search near my location"
        >
          @if (geoLoading()) {
            <mat-spinner diameter="16" />
          } @else {
            <ng-container>
              <mat-icon>my_location</mat-icon>
              Near Me
            </ng-container>
          }
        </button>

        @if (hasActiveFilters()) {
          <button
            mat-stroked-button
            class="clear-btn"
            aria-label="Clear all filters"
            (click)="clearFilters()"
          >
            <mat-icon>close</mat-icon>
            Clear
          </button>
        }
      </div>

      <!-- ── Featured Salons ────────────────────────────────────────────────── -->
      @if (!hasActiveFilters() && !hasSearched() && !isLoading() && featuredSalons().length > 0) {
        <section class="featured-section" aria-label="Featured salons">
          <h2 class="section-heading">
            <mat-icon class="section-icon">star</mat-icon>
            Featured Salons
          </h2>
          <div class="results-grid">
            @for (salon of featuredSalons(); track salon._id) {
              <lib-salon-card [salon]="salon" />
            }
          </div>
        </section>
      }

      <!-- ── Loading — skeleton grid ───────────────────────────────────────── -->
      @if (isLoading()) {
        <div class="results-grid" aria-label="Loading salons…" aria-busy="true">
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

        <div class="results-grid">
          @for (salon of results(); track salon._id) {
            <lib-salon-card [salon]="salon" />
          }
        </div>
      }

      <!-- ── Empty state ───────────────────────────────────────────────────── -->
      @if (!isLoading() && hasSearched() && results().length === 0 && !error()) {
        <div class="state-panel state-panel--empty" role="status">
          <mat-icon class="state-icon">search_off</mat-icon>
          <h2 class="state-title">No salons found</h2>
          <p class="state-message">
            We couldn&apos;t find any salons matching
            <strong>{{ activeQuery() }}</strong>.
            Try a different search term or adjust your filters.
          </p>
          <button mat-stroked-button (click)="clearFilters()">Clear filters</button>
        </div>
      }

      <!-- ── Error state ────────────────────────────────────────────────────── -->
      @if (!isLoading() && error()) {
        <div class="state-panel state-panel--error" role="alert">
          <mat-icon class="state-icon state-icon--error">error_outline</mat-icon>
          <h2 class="state-title">Something went wrong</h2>
          <p class="state-message">{{ error() }}</p>
          <button mat-raised-button color="primary" (click)="retrySearch()">
            <mat-icon>refresh</mat-icon>
            Try again
          </button>
        </div>
      }

      <!-- ── Initial / idle state ───────────────────────────────────────────── -->
      @if (!isLoading() && !hasSearched() && !error()) {
        <div class="state-panel state-panel--idle" aria-hidden="true">
          <mat-icon class="state-icon">content_cut</mat-icon>
          <p class="state-message">
            Start typing or choose a filter to discover salons near you
          </p>
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
      color: #f59e0b;
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

    this.loadFeaturedSalons();
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

  private loadFeaturedSalons(): void {
    this.salonService.getFeaturedSalons().subscribe({
      next: (salons) => this.featuredSalons.set(salons),
      error: () => { /* silently ignore — featured salons are non-critical */ },
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
