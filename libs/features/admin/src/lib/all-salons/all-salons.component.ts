import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnDestroy,
  OnInit,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';
import { FormsModule } from '@angular/forms';
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
import { MatSortModule } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';

import { AdminService, AdminSalon } from '@org/shared-data-access';
import { ConfirmDialogComponent } from '../shared/confirm-dialog.component';

@Component({
  selector: 'lib-all-salons',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DecimalPipe,
    FormsModule,
    MatButtonModule,
    MatChipsModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatPaginatorModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatSortModule,
    MatTableModule,
    MatTooltipModule,
  ],
  templateUrl: './all-salons.component.html',
  styleUrl:    './all-salons.component.scss',
})
export class AllSalonsComponent implements OnInit, OnDestroy {
  private readonly adminService = inject(AdminService);
  private readonly dialog       = inject(MatDialog);
  private readonly snack        = inject(MatSnackBar);
  private readonly destroy$     = new Subject<void>();
  private readonly search$      = new Subject<string>();

  readonly loading     = signal(true);
  readonly error       = signal<string | null>(null);
  readonly salons      = signal<AdminSalon[]>([]);
  readonly total       = signal(0);
  readonly page        = signal(0);
  readonly pageSize    = signal(10);
  readonly searchQuery = signal('');
  readonly statusFilter = signal('all');
  readonly actionId    = signal<string | null>(null);

  readonly displayedColumns = ['name', 'owner', 'city', 'status', 'rating', 'subscription', 'actions'];
  readonly statusOptions = [
    { value: 'all',      label: 'All' },
    { value: 'approved', label: 'Approved' },
    { value: 'pending',  label: 'Pending' },
    { value: 'rejected', label: 'Rejected' },
  ];

  ngOnInit(): void {
    this.search$.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      takeUntil(this.destroy$),
    ).subscribe((q) => {
      this.searchQuery.set(q);
      this.page.set(0);
      this.loadSalons();
    });

    this.loadSalons();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onSearch(value: string): void {
    this.search$.next(value);
  }

  onStatusChange(status: string): void {
    this.statusFilter.set(status);
    this.page.set(0);
    this.loadSalons();
  }

  onPage(e: PageEvent): void {
    this.page.set(e.pageIndex);
    this.pageSize.set(e.pageSize);
    this.loadSalons();
  }

  protected loadSalons(): void {
    this.loading.set(true);
    this.error.set(null);
    this.adminService.getAllSalons({
      page:   this.page() + 1,
      limit:  this.pageSize(),
      search: this.searchQuery() || undefined,
      status: this.statusFilter(),
    }).subscribe({
      next: (res) => {
        this.salons.set(res.data);
        this.total.set(res.total);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load salons');
        this.loading.set(false);
      },
    });
  }

  viewSalon(salon: AdminSalon): void {
    window.open(`/discover/${salon._id}`, '_blank');
  }

  suspend(salon: AdminSalon): void {
    const ref = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title:        'Suspend Salon',
        message:      `Suspend "${salon.name}"? It will be hidden from the public and the owner will lose access.`,
        confirmLabel: 'Suspend',
        danger:       true,
      },
      width: '440px',
    });

    ref.afterClosed().subscribe((ok: boolean) => {
      if (!ok) return;
      this.actionId.set(salon._id);
      this.adminService.suspendSalon(salon._id).subscribe({
        next: () => {
          this.salons.update((list) =>
            list.map((s) => s._id === salon._id ? { ...s, isActive: false } : s)
          );
          this.actionId.set(null);
          this.snack.open(`"${salon.name}" suspended`, undefined, { duration: 3000 });
        },
        error: () => {
          this.actionId.set(null);
          this.snack.open('Failed to suspend salon', 'Dismiss', { duration: 4000 });
        },
      });
    });
  }
}
