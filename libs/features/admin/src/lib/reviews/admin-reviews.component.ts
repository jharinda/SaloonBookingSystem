import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';

import { AdminService, AdminReview } from '@org/shared-data-access';
import { ConfirmDialogComponent } from '../shared/confirm-dialog.component';

@Component({
  selector: 'lib-admin-reviews',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    MatButtonModule,
    MatIconModule,
    MatPaginatorModule,
    MatProgressSpinnerModule,
    MatTableModule,
    MatTooltipModule,
  ],
  templateUrl: './admin-reviews.component.html',
  styleUrl:    './admin-reviews.component.scss',
})
export class AdminReviewsComponent implements OnInit {
  private readonly adminService = inject(AdminService);
  private readonly dialog       = inject(MatDialog);
  private readonly snack        = inject(MatSnackBar);

  readonly loading  = signal(true);
  readonly error    = signal<string | null>(null);
  readonly reviews  = signal<AdminReview[]>([]);
  readonly total    = signal(0);
  readonly page     = signal(0);
  readonly pageSize = signal(10);
  readonly actionId = signal<string | null>(null);

  readonly displayedColumns = ['salon', 'client', 'rating', 'comment', 'date', 'actions'];

  ngOnInit(): void {
    this.loadReviews();
  }

  onPage(e: PageEvent): void {
    this.page.set(e.pageIndex);
    this.pageSize.set(e.pageSize);
    this.loadReviews();
  }

  protected loadReviews(): void {
    this.loading.set(true);
    this.error.set(null);
    this.adminService.getAllReviews({
      page:  this.page() + 1,
      limit: this.pageSize(),
    }).subscribe({
      next: (res) => {
        this.reviews.set(res.data);
        this.total.set(res.total);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load reviews');
        this.loading.set(false);
      },
    });
  }

  remove(review: AdminReview): void {
    const ref = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title:        'Remove Review',
        message:      `Remove this review by ${review.clientName} for "${review.salonName}"?\n\nThe review will be hidden from the public.`,
        confirmLabel: 'Remove',
        danger:       true,
      },
      width: '440px',
    });

    ref.afterClosed().subscribe((ok: boolean) => {
      if (!ok) return;
      this.actionId.set(review._id);
      this.adminService.removeReview(review._id).subscribe({
        next: () => {
          this.reviews.update((list) => list.filter((r) => r._id !== review._id));
          this.total.update((t) => t - 1);
          this.actionId.set(null);
          this.snack.open('Review removed', undefined, { duration: 3000 });
        },
        error: () => {
          this.actionId.set(null);
          this.snack.open('Failed to remove review', 'Dismiss', { duration: 4000 });
        },
      });
    });
  }

  starsArray(): number[] {
    return [1, 2, 3, 4, 5];
  }
}
