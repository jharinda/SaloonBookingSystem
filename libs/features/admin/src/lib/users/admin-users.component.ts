import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { DatePipe, TitleCasePipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';

import { AdminService, AdminUser } from '@org/shared-data-access';
import { ConfirmDialogComponent } from '../shared/confirm-dialog.component';

@Component({
  selector: 'lib-admin-users',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    TitleCasePipe,
    MatButtonModule,
    MatChipsModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatPaginatorModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatTableModule,
    MatTooltipModule,
  ],
  templateUrl: './admin-users.component.html',
  styleUrl:    './admin-users.component.scss',
})
export class AdminUsersComponent implements OnInit {
  private readonly adminService = inject(AdminService);
  private readonly dialog       = inject(MatDialog);
  private readonly snack        = inject(MatSnackBar);

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

  onPage(e: PageEvent): void {
    this.page.set(e.pageIndex);
    this.pageSize.set(e.pageSize);
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
    this.snack.open(`Bookings for ${user.firstName} ${user.lastName} (coming soon)`, undefined, { duration: 2500 });
  }

  suspend(user: AdminUser): void {
    const ref = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title:        'Suspend Account',
        message:      `Suspend account for ${user.firstName} ${user.lastName} (${user.email})? They will lose access to the platform.`,
        confirmLabel: 'Suspend',
        danger:       true,
      },
      width: '440px',
    });

    ref.afterClosed().subscribe((ok: boolean) => {
      if (!ok) return;
      this.actionId.set(user._id);
      this.adminService.suspendUser(user._id).subscribe({
        next: () => {
          this.users.update((list) =>
            list.map((u) => u._id === user._id ? { ...u, isActive: false } : u)
          );
          this.actionId.set(null);
          this.snack.open('Account suspended', undefined, { duration: 3000 });
        },
        error: () => {
          this.actionId.set(null);
          this.snack.open('Failed to suspend account', 'Dismiss', { duration: 4000 });
        },
      });
    });
  }
}
