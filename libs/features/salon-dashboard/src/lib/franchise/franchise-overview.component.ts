import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';

import { Button } from 'primeng/button';
import { Card } from 'primeng/card';
import { Dialog } from 'primeng/dialog';
import { Message } from 'primeng/message';
import { ProgressBar } from 'primeng/progressbar';
import { TableModule } from 'primeng/table';
import { Tag } from 'primeng/tag';

import {
  CurrencyService,
  FranchiseOverview,
  PlanFeatureService,
  SalonAdminService,
  SubscriptionService,
} from '@org/shared-data-access';
import { Salon } from '@org/models';

import { RegisterSalonComponent } from '../register-salon/register-salon.component';

@Component({
  selector: 'lib-franchise-overview',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DecimalPipe,
    Button,
    Card,
    Dialog,
    Message,
    ProgressBar,
    TableModule,
    Tag,
    RegisterSalonComponent,
  ],
  templateUrl: './franchise-overview.component.html',
})
export class FranchiseOverviewComponent implements OnInit {
  private readonly admin = inject(SalonAdminService);
  private readonly subscription = inject(SubscriptionService);
  private readonly currency = inject(CurrencyService);
  private readonly planFeature = inject(PlanFeatureService);
  private readonly router = inject(Router);

  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly overview = signal<FranchiseOverview | null>(null);
  readonly maxLocations = signal<number | null>(null);
  readonly addDialogVisible = signal(false);

  readonly branches = computed(() => this.overview()?.branches ?? []);

  readonly locationUsed = computed(() => this.overview()?.totalBranches ?? 0);

  readonly locationMaxLabel = computed(() => {
    const m = this.maxLocations();
    if (m === null) return '—';
    return m === -1 ? '∞' : String(m);
  });

  readonly locationPercent = computed(() => {
    const max = this.maxLocations();
    const used = this.locationUsed();
    if (max === null || max <= 0 || max === -1) return 0;
    return Math.min(100, Math.round((used / max) * 100));
  });

  readonly locationLimit = computed(() => this.maxLocations() !== null);

  readonly canAddBranch = computed(() => {
    const max = this.maxLocations();
    const used = this.locationUsed();
    if (max === null) return true;
    if (max === -1) return true;
    return used < max;
  });

  readonly kpiCards = computed(() => {
    const o = this.overview();
    if (!o) return [];
    return [
      { label: 'Branches', value: String(o.totalBranches) },
      { label: 'Staff (total)', value: String(o.totalStaff) },
      { label: 'Combined rating', value: o.averageRating.toFixed(1) },
      {
        label: 'Combined revenue (30d)',
        value: this.currency.format(o.totalRevenue),
      },
    ];
  });

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.loadError.set(null);

    this.admin.getFranchiseOverview().subscribe({
      next: (o) => {
        this.overview.set(o);
        const firstId = o.branches[0]?._id;
        if (!firstId) {
          this.maxLocations.set(null);
          this.loading.set(false);
          return;
        }
        this.subscription.getPlanLimits(firstId).subscribe({
          next: (limits) => {
            this.maxLocations.set(limits.maxLocations);
            this.loading.set(false);
          },
          error: () => {
            this.maxLocations.set(null);
            this.loading.set(false);
          },
        });
      },
      error: () => {
        this.loadError.set('Could not load franchise overview.');
        this.loading.set(false);
      },
    });
  }

  subscriptionLabel(row: Salon & { subscriptionStatus?: string }): string {
    return row.subscriptionStatus ?? '—';
  }

  openAddDialog(): void {
    this.addDialogVisible.set(true);
  }

  onBranchCreated(salon: Salon): void {
    this.addDialogVisible.set(false);
    this.admin.setDashboardSalonId(salon._id);
    this.planFeature.reload();
    this.reload();
  }

  goToBranchDashboard(row: Salon): void {
    this.admin.setDashboardSalonId(row._id);
    void this.router.navigate(['/salon-dashboard/overview']);
  }
}
