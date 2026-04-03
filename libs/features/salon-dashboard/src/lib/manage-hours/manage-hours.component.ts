import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { Button } from 'primeng/button';
import { ProgressSpinner } from 'primeng/progressspinner';
import { ToggleSwitch } from 'primeng/toggleswitch';
import { MessageService } from 'primeng/api';

import { SalonAdminService, UpdateOperatingHoursDto } from '@org/shared-data-access';
import { SalonWorkingHours } from '@org/models';

const DAYS = [
  { key: 'monday',    label: 'Monday' },
  { key: 'tuesday',   label: 'Tuesday' },
  { key: 'wednesday', label: 'Wednesday' },
  { key: 'thursday',  label: 'Thursday' },
  { key: 'friday',    label: 'Friday' },
  { key: 'saturday',  label: 'Saturday' },
  { key: 'sunday',    label: 'Sunday' },
] as const;

type DayKey = (typeof DAYS)[number]['key'];

@Component({
  selector: 'lib-manage-hours',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    Button,
    ProgressSpinner,
    ToggleSwitch,
  ],
  template: `
    <div class="page-header">
      <h1 class="page-title">Operating Hours</h1>
      <p class="page-subtitle">Set the days and times your salon is open.</p>
    </div>

    @if (isLoading()) {
      <div class="state-center"><p-progressSpinner strokeWidth="3" animationDuration=".8s" [style]="{ width: '36px', height: '36px' }" /></div>
    } @else {
      <form [formGroup]="form" (ngSubmit)="save()" novalidate>
        <div class="hours-card">
          <div formArrayName="days">
            @for (day of dayConfigs; track day.key; let i = $index) {
              <div class="day-row" [formGroupName]="i">
                <span class="day-name">{{ day.label }}</span>

                <p-toggleSwitch formControlName="isOpen" />
                <span class="toggle-label">{{ form.controls.days.at(i).get('isOpen')?.value ? 'Open' : 'Closed' }}</span>

                @if (form.controls.days.at(i).get('isOpen')?.value) {
                  <div class="time-field">
                    <label class="time-label" [for]="'open-' + i">Opens</label>
                    <input type="time" class="time-input" formControlName="open" [id]="'open-' + i" />
                  </div>

                  <div class="time-field">
                    <label class="time-label" [for]="'close-' + i">Closes</label>
                    <input type="time" class="time-input" formControlName="close" [id]="'close-' + i" />
                  </div>
                } @else {
                  <span class="closed-label">Closed all day</span>
                }
              </div>

              @if (i < dayConfigs.length - 1) {
                <hr class="row-divider" />
              }
            }
          </div>
        </div>

        <div class="form-actions">
          <p-button
            label="Save Hours"
            icon="pi pi-save"
            type="submit"
            [disabled]="isSaving()"
            [loading]="isSaving()"
          />
        </div>
      </form>
    }
  `,
  styles: [`
    .page-header { margin-bottom: 28px; }
    .page-title  { font-size: 1.5rem; font-weight: 700; margin: 0 0 4px; color: #111827; }
    .page-subtitle { font-size: .85rem; color: #6b7280; margin: 0; }

    .state-center {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 80px;
    }

    .hours-card {
      background: #fff;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      overflow: hidden;
      margin-bottom: 24px;
      max-width: 680px;
    }

    .day-row {
      display: flex;
      align-items: center;
      gap: 20px;
      padding: 14px 20px;
      flex-wrap: wrap;
    }

    .day-name {
      width: 90px;
      font-weight: 600;
      font-size: .9rem;
      color: #374151;
      flex-shrink: 0;
    }

    .time-field {
      display: flex;
      flex-direction: column;
      gap: 4px;
      width: 120px;
    }

    .time-label {
      font-size: .75rem;
      color: #6b7280;
      font-weight: 500;
    }

    .time-input {
      border: 1px solid #d1d5db;
      border-radius: 6px;
      padding: 8px 10px;
      font-size: .88rem;
      outline: none;
      font-family: inherit;
    }

    .time-input:focus {
      border-color: var(--p-primary-500, #7c3aed);
      box-shadow: 0 0 0 2px var(--p-primary-100, #ede9fe);
    }

    .toggle-label {
      font-size: .82rem;
      color: #6b7280;
    }

    .closed-label {
      font-size: .82rem;
      color: #9ca3af;
      font-style: italic;
    }

    .row-divider {
      border: none;
      border-top: 1px solid #f3f4f6;
      margin: 0;
    }

    .form-actions {
      display: flex;
      gap: 12px;
    }

    button.p-button {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    @media (max-width: 480px) {
      .day-row { gap: 12px; }
      .time-field { width: 100px; }
    }

    :host-context(.dark) {
      .page-title   { color: #f4f4f5; }
      .page-subtitle { color: #a1a1aa; }
      .hours-card   { background: #18181b; border-color: #3f3f46; }
      .day-row      { border-color: #3f3f46; }
      .day-name     { color: #d4d4d8; }
      .time-label   { color: #a1a1aa; }
      .time-input   { background: #27272a; border-color: #52525b; color: #f4f4f5; color-scheme: dark; }
      .toggle-label { color: #a1a1aa; }
      .closed-label { color: #71717a; }
      .row-divider  { border-color: #3f3f46; }
    }
  `],
})
export class ManageHoursComponent implements OnInit {
  private readonly adminService = inject(SalonAdminService);
  private readonly fb           = inject(FormBuilder);
  private readonly msgSvc       = inject(MessageService);

  readonly dayConfigs = DAYS;
  readonly isLoading  = signal(true);
  readonly isSaving   = signal(false);

  private salonId = '';

  readonly form = this.fb.nonNullable.group({
    days: this.fb.array(
      DAYS.map(() =>
        this.fb.nonNullable.group({
          isOpen: [false],
          open:   ['09:00'],
          close:  ['18:00'],
        }),
      ),
    ),
  });

  ngOnInit(): void {
    this.adminService.getDashboardSalon().subscribe({
      next: (salon) => {
        this.salonId = salon._id;
        if (salon.workingHours) {
          this.patchForm(salon.workingHours);
        }
        this.isLoading.set(false);
      },
      error: () => this.isLoading.set(false),
    });
  }

  save(): void {
    this.isSaving.set(true);
    const dto = this.buildDto();
    this.adminService.updateOperatingHours(this.salonId, dto).subscribe({
      next: () => {
        this.isSaving.set(false);
        this.msgSvc.add({ severity: 'success', summary: 'Done', detail: 'Operating hours updated!', life: 3000 });
      },
      error: () => {
        this.isSaving.set(false);
        this.msgSvc.add({ severity: 'error', summary: 'Error', detail: 'Failed to save hours.', life: 4000 });
      },
    });
  }

  private patchForm(hours: Record<string, SalonWorkingHours>): void {
    DAYS.forEach((day, i) => {
      const h = hours[day.key];
      if (h) {
        (this.form.controls.days.at(i) as FormGroup).patchValue({
          isOpen: h.isOpen,
          open:   h.open,
          close:  h.close,
        });
      }
    });
  }

  private buildDto(): UpdateOperatingHoursDto {
    const dto: UpdateOperatingHoursDto = {};
    this.form.controls.days.controls.forEach((ctrl, i) => {
      const { isOpen, open, close } = ctrl.getRawValue();
      dto[DAYS[i].key as DayKey] = { isOpen, open, close };
    });
    return dto;
  }
}
