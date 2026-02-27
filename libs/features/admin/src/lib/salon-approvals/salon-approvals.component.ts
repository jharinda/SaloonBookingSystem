import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';

import { AdminService, AdminSalon } from '@org/shared-data-access';

import {
  RejectSalonDialogComponent,
  RejectSalonDialogResult,
} from '../shared/reject-salon-dialog.component';
import { ConfirmDialogComponent } from '../shared/confirm-dialog.component';

@Component({
  selector: 'lib-salon-approvals',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    MatButtonModule,
    MatChipsModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTableModule,
    MatTooltipModule,
  ],
  templateUrl: './salon-approvals.component.html',
  styleUrl:    './salon-approvals.component.scss',
})
export class SalonApprovalsComponent implements OnInit {
  private readonly adminService = inject(AdminService);
  private readonly dialog       = inject(MatDialog);
  private readonly snack        = inject(MatSnackBar);

  readonly loading  = signal(true);
  readonly error    = signal<string | null>(null);
  readonly pending  = signal<AdminSalon[]>([]);
  readonly actionId = signal<string | null>(null);  // salon id currently being actioned

  readonly displayedColumns = ['name', 'owner', 'city', 'submitted', 'actions'];

  ngOnInit(): void {
    this.loadPending();
  }

  protected loadPending(): void {
    this.loading.set(true);
    this.error.set(null);
    this.adminService.getPendingSalons().subscribe({
      next:  (list) => { this.pending.set(list); this.loading.set(false); },
      error: ()     => { this.error.set('Failed to load pending salons'); this.loading.set(false); },
    });
  }

  approve(salon: AdminSalon): void {
    const ref = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title:        'Approve Salon',
        message:      `Approve "${salon.name}"? The salon owner will be notified and the salon will become publicly visible.`,
        confirmLabel: 'Approve',
      },
      width: '440px',
    });

    ref.afterClosed().subscribe((ok: boolean) => {
      if (!ok) return;
      this.actionId.set(salon._id);
      this.adminService.approveSalon(salon._id).subscribe({
        next: () => {
          this.pending.update((list) => list.filter((s) => s._id !== salon._id));
          this.actionId.set(null);
          this.snack.open(`"${salon.name}" approved`, undefined, { duration: 3000 });
        },
        error: () => {
          this.actionId.set(null);
          this.snack.open('Failed to approve salon', 'Dismiss', { duration: 4000 });
        },
      });
    });
  }

  reject(salon: AdminSalon): void {
    const ref = this.dialog.open(RejectSalonDialogComponent, {
      data:  { salonName: salon.name },
      width: '480px',
    });

    ref.afterClosed().subscribe((result: RejectSalonDialogResult) => {
      if (!result?.confirmed) return;
      this.actionId.set(salon._id);
      this.adminService.rejectSalon(salon._id, result.reason).subscribe({
        next: () => {
          this.pending.update((list) => list.filter((s) => s._id !== salon._id));
          this.actionId.set(null);
          this.snack.open(`"${salon.name}" rejected`, undefined, { duration: 3000 });
        },
        error: () => {
          this.actionId.set(null);
          this.snack.open('Failed to reject salon', 'Dismiss', { duration: 4000 });
        },
      });
    });
  }
}
