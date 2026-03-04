import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { DatePipe, TitleCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Button } from 'primeng/button';
import { ProgressSpinner } from 'primeng/progressspinner';
import { Select } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { Tooltip } from 'primeng/tooltip';
import { MessageService } from 'primeng/api';
import { DialogService, DynamicDialogRef } from 'primeng/dynamicdialog';

import { AdminService, AdminUser } from '@org/shared-data-access';
import { ConfirmDialogComponent } from '../shared/confirm-dialog.component';

@Component({
  selector: 'lib-admin-users',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    TitleCasePipe,
    FormsModule,
    Button,
    ProgressSpinner,
    Select,
    TableModule,
    Tooltip,
  ],
  templateUrl: './admin-users.component.html',
  styleUrl:    './admin-users.component.scss',
})
export class AdminUsersComponent implements OnInit {
  private readonly adminService  = inject(AdminService);
  private readonly dialogService  = inject(DialogService);
  private readonly msgSvc         = inject(MessageService);

  private confirmDialogRef: DynamicDialogRef | null = null;

  readonly loading    = signal(true);
  readonly error      = signal<string | null>(null);
  readonly users      = signal<AdminUser[]>([]);
  readonly total      = signal(0);
  readonly page       = signal(0);
  readonly pageSize   = signal(10);
  readonly roleFilter = signal('all');
  readonly actionId   = signal<string | null>(null);

  readonly displayedColumns = ['name', 'email', 'role', 'joined', 'actions'];
  readonly roleOptions = [
    { value: 'all',          label: 'All Roles' },
    { value: 'client',       label: 'Client' },
    { value: 'salon_owner',  label: 'Salon Owner' },
    { value: 'stylist',      label: 'Stylist' },
  ];

  ngOnInit(): void {
    this.loadUsers();
  }

  onRoleChange(role: string): void {
    this.roleFilter.set(role);
    this.page.set(0);
    this.loadUsers();
  }

  onPage(e: { first: number; rows: number }): void {
    this.page.set(Math.floor(e.first / e.rows));
    this.pageSize.set(e.rows);
    this.loadUsers();
  }

  protected loadUsers(): void {
    this.loading.set(true);
    this.error.set(null);
    this.adminService.getUsers({
      page:  this.page() + 1,
      limit: this.pageSize(),
      role:  this.roleFilter(),
    }).subscribe({
      next: (res) => {
        this.users.set(res.data);
        this.total.set(res.total);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load users');
        this.loading.set(false);
      },
    });
  }

  viewBookings(user: AdminUser): void {
    // Navigate to /admin/salons?userId=... (placeholder)
    this.msgSvc.add({ severity: 'info', summary: 'Coming Soon', detail: `Bookings for ${user.firstName} ${user.lastName} (coming soon)`, life: 2500 });
  }

  suspend(user: AdminUser): void {
    this.confirmDialogRef = this.dialogService.open(ConfirmDialogComponent, {
      header: 'Suspend Account',
      width: '440px',
      closable: true,
      data: {
        title:        'Suspend Account',
        message:      `Suspend account for ${user.firstName} ${user.lastName} (${user.email})? They will lose access to the platform.`,
        confirmLabel: 'Suspend',
        danger:       true,
      },
    });

    this.confirmDialogRef?.onClose.subscribe((ok: boolean) => {
      if (!ok) return;
      this.actionId.set(user._id);
      this.adminService.suspendUser(user._id).subscribe({
        next: () => {
          this.users.update((list) =>
            list.map((u) => u._id === user._id ? { ...u, isActive: false } : u)
          );
          this.actionId.set(null);
          this.msgSvc.add({ severity: 'warn', summary: 'Suspended', detail: 'Account suspended', life: 3000 });
        },
        error: () => {
          this.actionId.set(null);
          this.msgSvc.add({ severity: 'error', summary: 'Error', detail: 'Failed to suspend account', life: 4000 });
        },
      });
    });
  }
}
