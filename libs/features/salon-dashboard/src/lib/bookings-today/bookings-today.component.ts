import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnDestroy,
  OnInit,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { interval, Subscription } from 'rxjs';
import { switchMap, startWith } from 'rxjs/operators';

import { AuthService, SalonAdminService } from '@org/shared-data-access';
import { Booking, BookingStatus } from '@org/models';

const STATUS_CONFIG: Record<BookingStatus, { label: string; css: string }> = {
  PENDING:     { label: 'Pending',     css: 'badge--pending' },
  CONFIRMED:   { label: 'Confirmed',   css: 'badge--confirmed' },
  IN_PROGRESS: { label: 'In Progress', css: 'badge--in-progress' },
  COMPLETED:   { label: 'Completed',   css: 'badge--completed' },
  CANCELLED:   { label: 'Cancelled',   css: 'badge--cancelled' },
  NO_SHOW:     { label: 'No Show',     css: 'badge--no-show' },
};

@Component({
  selector: 'lib-bookings-today',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTableModule,
    MatTooltipModule,
  ],
  template: `
    <div class="page-header">
      <h1 class="page-title">Today's Bookings</h1>
      <p class="page-subtitle">
        {{ today | date: 'EEEE, MMMM d, y' }} · auto-refreshes every 60 s
      </p>
    </div>

    @if (isLoading() && bookings().length === 0) {
      <div class="state-center">
        <mat-spinner diameter="40" />
        <span>Loading bookings…</span>
      </div>
    } @else if (loadError()) {
      <div class="state-center state--error">
        <mat-icon>error_outline</mat-icon>
        <span>{{ loadError() }}</span>
        <button mat-stroked-button (click)="loadBookings()">
          <mat-icon>refresh</mat-icon> Retry
        </button>
      </div>
    } @else if (bookings().length === 0) {
      <div class="state-center state--empty">
        <mat-icon>event_available</mat-icon>
        <p>No bookings scheduled for today.</p>
      </div>
    } @else {
      <!-- Desktop table -->
      <div class="table-wrapper">
        <table mat-table [dataSource]="bookings()" class="bookings-table">

          <!-- Time column -->
          <ng-container matColumnDef="time">
            <th mat-header-cell *matHeaderCellDef>Time</th>
            <td mat-cell *matCellDef="let b">
              <span class="time-badge">{{ b.startTime }}</span>
            </td>
          </ng-container>

          <!-- Client column -->
          <ng-container matColumnDef="client">
            <th mat-header-cell *matHeaderCellDef>Client</th>
            <td mat-cell *matCellDef="let b">{{ b.clientName ?? '—' }}</td>
          </ng-container>

          <!-- Service column -->
          <ng-container matColumnDef="service">
            <th mat-header-cell *matHeaderCellDef>Service</th>
            <td mat-cell *matCellDef="let b">{{ b.serviceName }}</td>
          </ng-container>

          <!-- Status column -->
          <ng-container matColumnDef="status">
            <th mat-header-cell *matHeaderCellDef>Status</th>
            <td mat-cell *matCellDef="let b">
              <span class="status-badge {{ statusCss(b.status) }}">
                {{ statusLabel(b.status) }}
              </span>
            </td>
          </ng-container>

          <!-- Actions column -->
          <ng-container matColumnDef="actions">
            <th mat-header-cell *matHeaderCellDef></th>
            <td mat-cell *matCellDef="let b">
              <div class="action-row">
                @if (b.status === 'PENDING') {
                  <button
                    mat-stroked-button
                    color="primary"
                    class="action-btn"
                    [disabled]="actionInProgress() === b._id"
                    (click)="confirm(b)"
                    matTooltip="Confirm appointment"
                  >
                    @if (actionInProgress() === b._id) {
                      <mat-spinner diameter="16" />
                    } @else {
                      <mat-icon>check</mat-icon>
                    }
                    Confirm
                  </button>
                }
                @if (b.status === 'CONFIRMED' || b.status === 'IN_PROGRESS') {
                  <button
                    mat-stroked-button
                    class="action-btn action-btn--complete"
                    [disabled]="actionInProgress() === b._id"
                    (click)="complete(b)"
                    matTooltip="Mark as completed"
                  >
                    <mat-icon>done_all</mat-icon>
                    Complete
                  </button>
                }
                @if (b.status !== 'COMPLETED' && b.status !== 'CANCELLED' && b.status !== 'NO_SHOW') {
                  <button
                    mat-icon-button
                    color="warn"
                    [disabled]="actionInProgress() === b._id"
                    (click)="cancel(b)"
                    matTooltip="Cancel appointment"
                    aria-label="Cancel"
                  >
                    <mat-icon>cancel</mat-icon>
                  </button>
                }
              </div>
            </td>
          </ng-container>

          <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
          <tr mat-row *matRowDef="let row; columns: displayedColumns;"></tr>
        </table>
      </div>
    }
  `,
  styles: [`
    .page-header { margin-bottom: 28px; }
    .page-title  { font-size: 1.5rem; font-weight: 700; margin: 0 0 4px; color: #111827; }
    .page-subtitle { font-size: .85rem; color: #6b7280; margin: 0; }

    .state-center {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 14px;
      padding: 80px 24px;
      color: #9ca3af;
      font-size: .9rem;
      text-align: center;
    }

    .state-center mat-icon { font-size: 2.5rem; width: 2.5rem; height: 2.5rem; }
    .state--error { color: #ef4444; }
    .state--empty mat-icon { color: #d1d5db; }

    .table-wrapper { overflow-x: auto; background: #fff; border-radius: 12px; border: 1px solid #e5e7eb; }

    .bookings-table { width: 100%; }

    .time-badge {
      font-family: monospace;
      font-size: .9rem;
      font-weight: 600;
      color: #1f2937;
    }

    .status-badge {
      display: inline-block;
      padding: 3px 10px;
      border-radius: 20px;
      font-size: .72rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: .04em;
    }

    .badge--pending     { background: #fef9c3; color: #a16207; }
    .badge--confirmed   { background: #dbeafe; color: #1d4ed8; }
    .badge--in-progress { background: #e0f2fe; color: #0369a1; }
    .badge--completed   { background: #dcfce7; color: #166534; }
    .badge--cancelled   { background: #fee2e2; color: #991b1b; }
    .badge--no-show     { background: #f3f4f6; color: #6b7280; }

    .action-row { display: flex; align-items: center; gap: 8px; }

    .action-btn { font-size: .8rem; height: 32px; padding: 0 12px; }
    .action-btn--complete { color: #16a34a; border-color: #16a34a; }

    @media (max-width: 600px) {
      .table-wrapper { font-size: .8rem; }
    }
  `],
})
export class BookingsTodayComponent implements OnInit, OnDestroy {
  private readonly adminService  = inject(SalonAdminService);
  private readonly authService   = inject(AuthService);
  private readonly snack         = inject(MatSnackBar);

  readonly today    = new Date();
  readonly bookings = signal<Booking[]>([]);
  readonly isLoading     = signal(true);
  readonly loadError     = signal<string | null>(null);
  readonly actionInProgress = signal<string | null>(null);

  readonly displayedColumns = ['time', 'client', 'service', 'status', 'actions'];

  private salonId = '';
  private intervalSub?: Subscription;

  statusLabel(s: BookingStatus): string { return STATUS_CONFIG[s]?.label ?? s; }
  statusCss(s: BookingStatus): string   { return STATUS_CONFIG[s]?.css ?? ''; }

  ngOnInit(): void {
    // Retrieve salonId from JWT via AuthService
    const jwt = this.authService.currentUser();
    this.salonId = (jwt as unknown as { salonId?: string })?.salonId ?? '';

    // Poll every 60 s, starting immediately
    this.intervalSub = interval(60_000)
      .pipe(
        startWith(0),
        switchMap(() => {
          this.isLoading.set(true);
          this.loadError.set(null);
          return this.adminService.getTodayBookings(this.salonId);
        }),
      )
      .subscribe({
        next: (data) => {
          this.bookings.set(data);
          this.isLoading.set(false);
        },
        error: () => {
          this.loadError.set('Could not load bookings. Will retry on next refresh.');
          this.isLoading.set(false);
        },
      });
  }

  ngOnDestroy(): void {
    this.intervalSub?.unsubscribe();
  }

  loadBookings(): void {
    this.isLoading.set(true);
    this.loadError.set(null);
    this.adminService.getTodayBookings(this.salonId).subscribe({
      next: (data) => {
        this.bookings.set(data);
        this.isLoading.set(false);
      },
      error: () => {
        this.loadError.set('Could not load bookings.');
        this.isLoading.set(false);
      },
    });
  }

  confirm(b: Booking): void {
    this.doAction(b._id, this.adminService.confirmBooking(b._id), 'Booking confirmed.');
  }

  complete(b: Booking): void {
    this.doAction(b._id, this.adminService.completeBooking(b._id), 'Booking marked complete.');
  }

  cancel(b: Booking): void {
    this.doAction(b._id, this.adminService.cancelBooking(b._id), 'Booking cancelled.');
  }

  private doAction(
    id: string,
    obs: ReturnType<SalonAdminService['confirmBooking']>,
    successMsg: string,
  ): void {
    this.actionInProgress.set(id);
    obs.subscribe({
      next: (updated) => {
        this.bookings.update((list) =>
          list.map((b) => (b._id === updated._id ? updated : b)),
        );
        this.actionInProgress.set(null);
        this.snack.open(successMsg, 'OK', { duration: 3000 });
      },
      error: () => {
        this.actionInProgress.set(null);
        this.snack.open('Action failed. Please try again.', 'Dismiss', { duration: 4000 });
      },
    });
  }
}
