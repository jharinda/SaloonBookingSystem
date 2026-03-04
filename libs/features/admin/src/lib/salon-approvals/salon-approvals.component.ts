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

import { MessageService } from 'primeng/api';
import { DialogService, DynamicDialogRef } from 'primeng/dynamicdialog';

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
    Button,
    ProgressSpinner,
    TableModule,
  ],
  templateUrl: './salon-approvals.component.html',
  styleUrl:    './salon-approvals.component.scss',
})
export class SalonApprovalsComponent implements OnInit {
  private readonly adminService  = inject(AdminService);
  private readonly dialogService  = inject(DialogService);
  private readonly msgSvc         = inject(MessageService);

  private approveDialogRef: DynamicDialogRef | null = null;
  private rejectDialogRef: DynamicDialogRef | null = null;

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
    this.approveDialogRef = this.dialogService.open(ConfirmDialogComponent, {
      header: 'Approve Salon',
      width: '440px',
      closable: true,
      data: {
        title:        'Approve Salon',
        message:      `Approve "${salon.name}"? The salon owner will be notified and the salon will become publicly visible.`,
        confirmLabel: 'Approve',
      },
    });

    this.approveDialogRef?.onClose.subscribe((ok: boolean) => {
      if (!ok) return;
      this.actionId.set(salon._id);
      this.adminService.approveSalon(salon._id).subscribe({
        next: () => {
          this.pending.update((list) => list.filter((s) => s._id !== salon._id));
          this.actionId.set(null);
          this.msgSvc.add({ severity: 'success', summary: 'Approved', detail: `"${salon.name}" approved`, life: 3000 });
        },
        error: () => {
          this.actionId.set(null);
          this.msgSvc.add({ severity: 'error', summary: 'Error', detail: 'Failed to approve salon', life: 4000 });
        },
      });
    });
  }

  reject(salon: AdminSalon): void {
    this.rejectDialogRef = this.dialogService.open(RejectSalonDialogComponent, {
      header: 'Reject Salon',
      width: '480px',
      closable: true,
      data: { salonName: salon.name },
    });

    this.rejectDialogRef?.onClose.subscribe((result: RejectSalonDialogResult) => {
      if (!result?.confirmed) return;
      this.actionId.set(salon._id);
      this.adminService.rejectSalon(salon._id, result.reason).subscribe({
        next: () => {
          this.pending.update((list) => list.filter((s) => s._id !== salon._id));
          this.actionId.set(null);
          this.msgSvc.add({ severity: 'warn', summary: 'Rejected', detail: `"${salon.name}" rejected`, life: 3000 });
        },
        error: () => {
          this.actionId.set(null);
          this.msgSvc.add({ severity: 'error', summary: 'Error', detail: 'Failed to reject salon', life: 4000 });
        },
      });
    });
  }
}
