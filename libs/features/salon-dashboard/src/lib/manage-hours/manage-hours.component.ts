import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';

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
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSlideToggleModule,
  ],
  template: `
    <div class="page-header">
      <h1 class="page-title">Operating Hours</h1>
      <p class="page-subtitle">Set the days and times your salon is open.</p>
    </div>

    @if (isLoading()) {
      <div class="state-center"><mat-spinner diameter="36" /></div>
    } @else {
      <form [formGroup]="form" (ngSubmit)="save()" novalidate>
        <div class="hours-card">
          <div formArrayName="days">
            @for (day of dayConfigs; track day.key; let i = $index) {
              <div class="day-row" [formGroupName]="i">
                <span class="day-name">{{ day.label }}</span>

                <mat-slide-toggle formControlName="isOpen" color="primary">
                  {{ form.controls.days.at(i).get('isOpen')?.value ? 'Open' : 'Closed' }}
                </mat-slide-toggle>

                @if (form.controls.days.at(i).get('isOpen')?.value) {
                  <mat-form-field appearance="outline" class="time-field">
                    <mat-label>Opens</mat-label>
                    <input matInput type="time" formControlName="open" />
                  </mat-form-field>

                  <mat-form-field appearance="outline" class="time-field">
                    <mat-label>Closes</mat-label>
                    <input matInput type="time" formControlName="close" />
                  </mat-form-field>
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
          <button
            mat-flat-button
            color="primary"
            type="submit"
            [disabled]="isSaving()"
          >
            @if (isSaving()) {
              <mat-spinner diameter="18" />
            } @else {
              <mat-icon>save</mat-icon>
            }
            Save Hours
          </button>
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
      width: 120px;
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

    button[mat-flat-button] {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    @media (max-width: 480px) {
      .day-row { gap: 12px; }
      .time-field { width: 100px; }
    }
  `],
})
export class ManageHoursComponent implements OnInit {
  private readonly adminService = inject(SalonAdminService);
  private readonly fb           = inject(FormBuilder);
  private readonly snack        = inject(MatSnackBar);

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
    this.adminService.getOwnSalon().subscribe({
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
        this.snack.open('Operating hours updated!', 'OK', { duration: 3000 });
      },
      error: () => {
        this.isSaving.set(false);
        this.snack.open('Failed to save hours.', 'Dismiss', { duration: 4000 });
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
