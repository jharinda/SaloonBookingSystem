import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { debounceTime, Subject } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { Card } from 'primeng/card';
import { Button } from 'primeng/button';
import { InputText } from 'primeng/inputtext';
import { IconField } from 'primeng/iconfield';
import { InputIcon } from 'primeng/inputicon';
import { Select } from 'primeng/select';
import { Rating } from 'primeng/rating';
import { Skeleton } from 'primeng/skeleton';

import { Salon } from '@org/models';
import { SalonService, SearchParams } from '@org/shared-data-access';

interface SelectOption {
  label: string;
  value: string;
}

@Component({
  selector: 'lib-discover',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Default,
  imports: [
    FormsModule,
    Card,
    Button,
    InputText,
    IconField,
    InputIcon,
    Select,
    Rating,
    Skeleton,
  ],
  templateUrl: './discover.html',
  styleUrl: './discover.css',
})
export class Discover implements OnInit {
  private readonly salonService = inject(SalonService);
  private readonly router       = inject(Router);

  // ── State ────────────────────────────────────────────────────────────────
  readonly salons   = signal<Salon[]>([]);
  readonly loading  = signal(false);

  searchQuery  = '';
  serviceType  = '';
  city         = '';
  sortBy       = '';

  private readonly search$ = new Subject<void>();

  // ── Filter options ───────────────────────────────────────────────────────
  readonly serviceTypeOptions: SelectOption[] = [
    { label: 'All',     value: '' },
    { label: 'Hair',    value: 'Hair' },
    { label: 'Nails',   value: 'Nails' },
    { label: 'Skin',    value: 'Skin' },
    { label: 'Massage', value: 'Massage' },
    { label: 'Spa',     value: 'Spa' },
  ];

  readonly cityOptions: SelectOption[] = [
    { label: 'All Cities',   value: '' },
    { label: 'Colombo',      value: 'Colombo' },
    { label: 'Kandy',        value: 'Kandy' },
    { label: 'Galle',        value: 'Galle' },
    { label: 'Negombo',      value: 'Negombo' },
    { label: 'Matara',       value: 'Matara' },
    { label: 'Jaffna',       value: 'Jaffna' },
    { label: 'Trincomalee',  value: 'Trincomalee' },
    { label: 'Kurunegala',   value: 'Kurunegala' },
  ];

  readonly sortByOptions: SelectOption[] = [
    { label: 'Rating',   value: 'rating' },
    { label: 'Distance', value: 'distance' },
    { label: 'Price',    value: 'price' },
  ];

  // ── Lifecycle ────────────────────────────────────────────────────────────
  constructor() {
    this.search$
      .pipe(debounceTime(300), takeUntilDestroyed())
      .subscribe(() => this.fetchSalons());
  }

  ngOnInit(): void {
    this.fetchSalons();
  }

  // ── Methods ──────────────────────────────────────────────────────────────
  onSearchInput(): void {
    this.search$.next();
  }

  onFilterChange(): void {
    this.fetchSalons();
  }

  coverImage(salon: Salon): string {
    return salon.images?.[0]?.url ?? 'https://placehold.co/600x400?text=No+Image';
  }

  onBookNow(salon: Salon): void {
    this.router.navigate(['/discover', salon._id]);
  }

  private fetchSalons(): void {
    this.loading.set(true);

    const params: SearchParams = {};
    if (this.searchQuery)  params.q       = this.searchQuery;
    if (this.serviceType)  params.service  = this.serviceType;
    if (this.city)         params.city     = this.city;

    this.salonService.searchSalons(params).subscribe({
      next: (res) => {
        let results = res.data ?? [];
        // Client-side sort fallback (no sortBy param on the API)
        if (this.sortBy === 'rating') {
          results = [...results].sort((a, b) => b.rating - a.rating);
        } else if (this.sortBy === 'price') {
          results = [...results].sort((a, b) => {
            const minA = a.services.length ? Math.min(...a.services.map(s => s.price)) : 0;
            const minB = b.services.length ? Math.min(...b.services.map(s => s.price)) : 0;
            return minA - minB;
          });
        }
        this.salons.set(results);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}
