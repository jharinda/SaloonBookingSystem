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
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ProgressSpinner } from 'primeng/progressspinner';

import { Button } from 'primeng/button';
import { Rating } from 'primeng/rating';
import { Tag } from 'primeng/tag';
import { Panel } from 'primeng/panel';
import { TableModule } from 'primeng/table';
import { Tabs, TabList, Tab, TabPanels, TabPanel } from 'primeng/tabs';

import { Salon, SalonServiceItem, Review, ReviewsPage } from '@org/models';
import { SalonService, AppCurrencyPipe, CurrencyService } from '@org/shared-data-access';
import { ReviewService } from '@org/shared-data-access';

// ── Constants ─────────────────────────────────────────────────────────────────

const DAYS: { key: string; day: number; label: string }[] = [
  { key: 'monday',    day: 1, label: 'Monday'    },
  { key: 'tuesday',   day: 2, label: 'Tuesday'   },
  { key: 'wednesday', day: 3, label: 'Wednesday' },
  { key: 'thursday',  day: 4, label: 'Thursday'  },
  { key: 'friday',    day: 5, label: 'Friday'    },
  { key: 'saturday',  day: 6, label: 'Saturday'  },
  { key: 'sunday',    day: 0, label: 'Sunday'    },
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
    FormsModule,
    ProgressSpinner,
    Button,
    Rating,
    Tag,
    Panel,
    TableModule,
    Tabs, TabList, Tab, TabPanels, TabPanel,
    AppCurrencyPipe,
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
  private readonly msgSvc        = inject(MessageService);
  readonly currencyService       = inject(CurrencyService);

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
    const img = s.images[this.activeImageIdx()] ?? s.images[0];
    return img?.url ?? null;
  });

  readonly thumbnails = computed(() =>
    (this.salon()?.images ?? []).map((img) => img.url).filter(Boolean) as string[],
  );

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
    const oh = this.salon()?.operatingHours ?? [];
    return DAYS.map((d) => {
      const entry = oh.find((h) => h.day === d.day);
      return {
        ...d,
        hours: entry
          ? { open: entry.open, close: entry.close, isOpen: !entry.closed }
          : null,
      };
    });
  });

  readonly openNowStatus = computed(() => {
    const oh = this.salon()?.operatingHours;
    if (!oh?.length) return null;
    const todayDay = new Date().getDay();
    const todayEntry = oh.find((h) => h.day === todayDay);
    if (!todayEntry || todayEntry.closed) return 'closed';
    return isOpenNow(todayEntry.open, todayEntry.close) ? 'open' : 'closed';
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
  readonly imageCount = computed(() => this.salon()?.images?.length ?? 0);

  selectImage(idx: number): void {
    this.activeImageIdx.set(idx);
  }

  prevImage(): void {
    const count = this.imageCount();
    if (count < 2) return;
    this.activeImageIdx.update((i) => (i - 1 + count) % count);
  }

  nextImage(): void {
    const count = this.imageCount();
    if (count < 2) return;
    this.activeImageIdx.update((i) => (i + 1) % count);
  }

  private touchStartX = 0;

  onTouchStart(e: TouchEvent): void {
    this.touchStartX = e.changedTouches[0]?.clientX ?? 0;
  }

  onTouchEnd(e: TouchEvent): void {
    const dx = (e.changedTouches[0]?.clientX ?? 0) - this.touchStartX;
    if (Math.abs(dx) < 40) return; // ignore tiny taps
    if (dx < 0) {
      this.nextImage();
    } else {
      this.prevImage();
    }
  }

  // ── Navigation / booking ────────────────────────────────────────────────────
  bookSalon(): void {
    void this.router.navigate(['/booking', this.salonId]);
  }

  bookService(serviceId: string): void {
    void this.router.navigate(['/booking', this.salonId], {
      queryParams: { serviceId },
    });
  }

  // ── Chat ────────────────────────────────────────────────────────────────────
  openChat(): void {
    const s = this.salon();
    if (!s) return;

    void this.router.navigate(['/chat'], {
      state: {
        salon: {
          id: this.salonId,
          name: s.name,
          avatar: s.images?.[0]?.url || null,
        },
      },
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
      this.msgSvc.add({ severity: 'success', summary: 'Copied', detail: 'Link copied!', life: 2500 });
    } catch {
      this.msgSvc.add({ severity: 'error', summary: 'Error', detail: 'Could not copy link.', life: 2500 });
    }
  }
}
