import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe, DecimalPipe, NgOptimizedImage } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';

import { Salon, SalonServiceItem, Review, ReviewsPage } from '@org/models';
import { SalonService } from '@org/shared-data-access';
import { ReviewService } from '@org/shared-data-access';

// ── Constants ─────────────────────────────────────────────────────────────────

const DAYS: { key: string; label: string }[] = [
  { key: 'monday',    label: 'Monday'    },
  { key: 'tuesday',   label: 'Tuesday'   },
  { key: 'wednesday', label: 'Wednesday' },
  { key: 'thursday',  label: 'Thursday'  },
  { key: 'friday',    label: 'Friday'    },
  { key: 'saturday',  label: 'Saturday'  },
  { key: 'sunday',    label: 'Sunday'    },
];

const REVIEW_LIMIT = 5;

// ── Helpers ───────────────────────────────────────────────────────────────────

type StarKind = 'full' | 'half' | 'empty';

function toStars(rating: number): StarKind[] {
  const clamped = Math.max(0, Math.min(5, rating));
  return Array.from({ length: 5 }, (_, i) => {
    const diff = clamped - i;
    if (diff >= 0.75) return 'full';
    if (diff >= 0.25) return 'half';
    return 'empty';
  });
}

function formatTime(t: string): string {
  const [hStr, mStr] = t.split(':');
  const h = parseInt(hStr, 10);
  const m = mStr ?? '00';
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${m} ${suffix}`;
}

function isOpenNow(open: string, close: string): boolean {
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const [oh, om] = open.split(':').map(Number);
  const [ch, cm] = close.split(':').map(Number);
  return nowMins >= oh * 60 + (om ?? 0) && nowMins < ch * 60 + (cm ?? 0);
}

// ── Component ─────────────────────────────────────────────────────────────────

@Component({
  selector: 'lib-salon-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    DecimalPipe,
    NgOptimizedImage,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatProgressBarModule,
    MatChipsModule,
    MatDividerModule,
    MatTooltipModule,
  ],
  templateUrl: './salon-detail.component.html',
  styleUrl: './salon-detail.component.scss',
})
export class SalonDetailComponent implements OnInit {
  // ── Dependencies ────────────────────────────────────────────────────────────
  private readonly route         = inject(ActivatedRoute);
  private readonly router        = inject(Router);
  private readonly salonService  = inject(SalonService);
  private readonly reviewService = inject(ReviewService);
  private readonly snack         = inject(MatSnackBar);

  // ── State ───────────────────────────────────────────────────────────────────
  readonly salon          = signal<Salon | null>(null);
  readonly loading        = signal(true);
  readonly error          = signal<string | null>(null);

  readonly activeImageIdx = signal(0);

  readonly reviews        = signal<Review[]>([]);
  readonly reviewsLoading = signal(false);
  readonly reviewPage     = signal(1);
  readonly totalReviews   = signal(0);

  // ── Internals ───────────────────────────────────────────────────────────────
  private salonId = '';

  readonly todayKey = new Date()
    .toLocaleDateString('en-US', { weekday: 'long' })
    .toLowerCase();

  // ── Derived signals ─────────────────────────────────────────────────────────

  readonly coverImage = computed(() => {
    const s = this.salon();
    if (!s?.images?.length) return null;
    return s.images[this.activeImageIdx()] ?? s.images[0];
  });

  readonly thumbnails = computed(() => this.salon()?.images ?? []);

  readonly salonStars = computed(() => toStars(this.salon()?.rating ?? 0));

  readonly groupedServices = computed<Record<string, SalonServiceItem[]>>(() => {
    const services = this.salon()?.services ?? [];
    return services.reduce<Record<string, SalonServiceItem[]>>((acc, svc) => {
      const cat = svc.category || 'Other';
      (acc[cat] ??= []).push(svc);
      return acc;
    }, {});
  });

  readonly serviceCategories = computed(() =>
    Object.keys(this.groupedServices())
  );

  readonly lowestPrice = computed(() => {
    const services = this.salon()?.services ?? [];
    if (!services.length) return 0;
    return Math.min(...services.map((s) => s.price));
  });

  readonly operatingHours = computed(() => {
    const wh = this.salon()?.workingHours ?? {};
    return DAYS.map((d) => ({
      ...d,
      hours: (wh[d.key] as import('@org/models').SalonWorkingHours | undefined) ?? null,
      isToday: d.key === this.todayKey,
    }));
  });

  readonly openNowStatus = computed(() => {
    const wh = this.salon()?.workingHours;
    if (!wh) return null;
    const todayHours = wh[this.todayKey];
    if (!todayHours?.isOpen) return 'closed';
    return isOpenNow(todayHours.open, todayHours.close) ? 'open' : 'closed';
  });

  readonly hasMoreReviews = computed(
    () => this.reviews().length < this.totalReviews()
  );

  readonly ratingBreakdown = computed(() => {
    const data = this.reviews();
    const total = data.length || 1;
    return [5, 4, 3, 2, 1].map((star) => {
      const count = data.filter((r) => Math.round(r.rating) === star).length;
      return { star, pct: Math.round((count / total) * 100) };
    });
  });

  // ── Exposed helpers for template ────────────────────────────────────────────
  readonly days = DAYS;
  readonly toStars = toStars;
  readonly formatTime = formatTime;

  // ── Lifecycle ───────────────────────────────────────────────────────────────
  ngOnInit(): void {
    this.salonId = this.route.snapshot.paramMap.get('salonId') ?? '';
    if (!this.salonId) {
      this.error.set('Salon not found');
      this.loading.set(false);
      return;
    }
    this.loadSalon();
    this.loadReviews();
  }

  // ── Data loading ────────────────────────────────────────────────────────────
  private loadSalon(): void {
    this.loading.set(true);
    this.error.set(null);

    this.salonService.getSalonById(this.salonId).subscribe({
      next: (s) => {
        this.salon.set(s);
        this.loading.set(false);
      },
      error: (err: { status?: number }) => {
        this.loading.set(false);
        this.error.set(
          err?.status === 404
            ? 'Salon not found'
            : 'Could not load salon. Please try again.',
        );
      },
    });
  }

  loadReviews(): void {
    this.reviewsLoading.set(true);
    this.reviewService
      .getReviewsForSalon(this.salonId, this.reviewPage(), REVIEW_LIMIT)
      .subscribe({
        next: (page: ReviewsPage) => {
          this.reviews.update((prev) => [...prev, ...page.data]);
          this.totalReviews.set(page.total);
          this.reviewsLoading.set(false);
        },
        error: () => this.reviewsLoading.set(false),
      });
  }

  loadMoreReviews(): void {
    this.reviewPage.update((p) => p + 1);
    this.loadReviews();
  }

  // ── Gallery ─────────────────────────────────────────────────────────────────
  selectImage(idx: number): void {
    this.activeImageIdx.set(idx);
  }

  // ── Navigation / booking ────────────────────────────────────────────────────
  bookSalon(): void {
    const isMobile = window.innerWidth < 768;
    if (isMobile) {
      void this.router.navigate(['/booking'], {
        queryParams: { salonId: this.salonId },
      });
    } else {
      document.getElementById('services-section')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }
  }

  bookService(serviceId: string): void {
    void this.router.navigate(['/booking'], {
      queryParams: { salonId: this.salonId, serviceId },
    });
  }

  // ── Share ────────────────────────────────────────────────────────────────────
  async share(): Promise<void> {
    const url = window.location.href;
    const title = this.salon()?.name ?? 'SnapSalon';

    if (navigator.share) {
      try {
        await navigator.share({ title, url });
      } catch {
        // User dismissed — no-op
      }
      return;
    }

    try {
      await navigator.clipboard.writeText(url);
      this.snack.open('Link copied!', undefined, { duration: 2500 });
    } catch {
      this.snack.open('Could not copy link.', undefined, { duration: 2500 });
    }
  }
}
