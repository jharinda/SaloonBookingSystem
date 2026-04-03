import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  output,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Select } from 'primeng/select';

import { PlanFeatureService, SalonAdminService } from '@org/shared-data-access';
import { Salon } from '@org/models';

@Component({
  selector: 'lib-branch-selector',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, Select],
  template: `
    @if (branches().length > 1) {
      <div class="flex items-center gap-2 flex-wrap">
        <span class="text-sm font-medium text-zinc-600 dark:text-zinc-300">Branch</span>
        <p-select
          [options]="branches()"
          optionLabel="name"
          optionValue="_id"
          [ngModel]="currentSalonId()"
          (ngModelChange)="onSelect($event)"
          [appendTo]="'body'"
          styleClass="min-w-[220px]"
          placeholder="Select branch"
        />
      </div>
    }
  `,
})
export class BranchSelectorComponent {
  private readonly admin = inject(SalonAdminService);
  private readonly planFeature = inject(PlanFeatureService);
  private readonly router = inject(Router);

  readonly branches = input<Salon[]>([]);
  readonly currentSalonId = input<string | null>(null);
  readonly salonChanged = output<Salon>();

  onSelect(salonId: string | null): void {
    if (!salonId) return;
    this.admin.setDashboardSalonId(salonId);
    this.admin.getDashboardSalon().subscribe({
      next: (s) => {
        this.salonChanged.emit(s);
        this.planFeature.reload();
      },
    });
    void this.router.navigate(['/salon-dashboard/overview']);
  }
}
