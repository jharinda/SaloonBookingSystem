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
import { Button } from 'primeng/button';
import { InputText } from 'primeng/inputtext';
import { ProgressSpinner } from 'primeng/progressspinner';
import { Select } from 'primeng/select';
import { TableModule, TableLazyLoadEvent } from 'primeng/table';

import { MessageService } from 'primeng/api';
import { DialogService, DynamicDialogRef } from 'primeng/dynamicdialog';

import { AdminService, AdminSalon } from '@org/shared-data-access';
import { ConfirmDialogComponent } from '../shared/confirm-dialog.component';

@Component({
  selector: 'lib-all-salons',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DecimalPipe,
    FormsModule,
    Button,
    InputText,
    ProgressSpinner,
    Select,
    TableModule,
  ],
  templateUrl: './all-salons.component.html',
  styleUrl:    './all-salons.component.scss',
})
export class AllSalonsComponent implements OnInit, OnDestroy {
  private readonly adminService = inject(AdminService);
  private readonly dialogService = inject(DialogService);
  private readonly msgSvc        = inject(MessageService);

  private readonly destroy$      = new Subject<void>();
  private readonly search$       = new Subject<string>();

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
    // Wire up debounced search. The initial data load is triggered by p-table's
    // onLazyLoad event which fires automatically when the table first renders.
    // Do NOT call loadSalons() here — that would destroy/recreate the table on
    // every load cycle, causing the onLazyLoad → loadSalons infinite loop.
    this.search$.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      takeUntil(this.destroy$),
    ).subscribe((q) => {
      this.searchQuery.set(q);
      this.page.set(0);
      this.loadSalons();
    });
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

  onPage(e: TableLazyLoadEvent): void {
    this.page.set(Math.floor((e.first ?? 0) / (e.rows ?? 10)));
    this.pageSize.set(e.rows ?? 10);
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
    const ref = this.dialogService.open(ConfirmDialogComponent, {
      header: 'Suspend Salon',
      width: '440px',
      closable: true,
      data: {
        title:        'Suspend Salon',
        message:      `Suspend "${salon.name}"? It will be hidden from the public and the owner will lose access.`,
        confirmLabel: 'Suspend',
        danger:       true,
      },
    });

    ref?.onClose.subscribe((ok: boolean) => {
      if (!ok) return;
      this.actionId.set(salon._id);
      this.adminService.suspendSalon(salon._id).subscribe({
        next: () => {
          this.salons.update((list) =>
            list.map((s) => s._id === salon._id ? { ...s, isActive: false } : s)
          );
          this.actionId.set(null);
          this.msgSvc.add({ severity: 'warn', summary: 'Suspended', detail: `"${salon.name}" suspended`, life: 3000 });
        },
        error: () => {
          this.actionId.set(null);
          this.msgSvc.add({ severity: 'error', summary: 'Error', detail: 'Failed to suspend salon', life: 4000 });
        },
      });
    });
  }
}
