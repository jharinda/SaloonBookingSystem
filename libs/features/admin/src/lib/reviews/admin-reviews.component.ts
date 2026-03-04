import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { Button } from 'primeng/button';
import { ProgressSpinner } from 'primeng/progressspinner';
import { TableModule } from 'primeng/table';
import { Tooltip } from 'primeng/tooltip';
import { MessageService } from 'primeng/api';
import { DialogService, DynamicDialogRef } from 'primeng/dynamicdialog';

import { AdminService, AdminReview } from '@org/shared-data-access';
import { ConfirmDialogComponent } from '../shared/confirm-dialog.component';

@Component({
  selector: 'lib-admin-reviews',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    Button,
    ProgressSpinner,
    TableModule,
    Tooltip,
  ],
  templateUrl: './admin-reviews.component.html',
  styleUrl:    './admin-reviews.component.scss',
})
export class AdminReviewsComponent implements OnInit {
  private readonly adminService  = inject(AdminService);
  private readonly dialogService  = inject(DialogService);
  private readonly msgSvc         = inject(MessageService);

  private confirmDialogRef: DynamicDialogRef | null = null;

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

  onPage(e: { first: number; rows: number }): void {
    this.page.set(Math.floor(e.first / e.rows));
    this.pageSize.set(e.rows);
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
    this.confirmDialogRef = this.dialogService.open(ConfirmDialogComponent, {
      header: 'Remove Review',
      width: '440px',
      closable: true,
      data: {
        title:        'Remove Review',
        message:      `Remove this review by ${review.clientName} for "${review.salonName}"?\n\nThe review will be hidden from the public.`,
        confirmLabel: 'Remove',
        danger:       true,
      },
    });

    this.confirmDialogRef?.onClose.subscribe((ok: boolean) => {
      if (!ok) return;
      this.actionId.set(review._id);
      this.adminService.removeReview(review._id).subscribe({
        next: () => {
          this.reviews.update((list) => list.filter((r) => r._id !== review._id));
          this.total.update((t) => t - 1);
          this.actionId.set(null);
          this.msgSvc.add({ severity: 'success', summary: 'Done', detail: 'Review removed', life: 3000 });
        },
        error: () => {
          this.actionId.set(null);
          this.msgSvc.add({ severity: 'error', summary: 'Error', detail: 'Failed to remove review', life: 4000 });
        },
      });
    });
  }

  starsArray(): number[] {
    return [1, 2, 3, 4, 5];
  }
}
