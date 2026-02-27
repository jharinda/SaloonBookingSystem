import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  OnInit,
} from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import {
  MatDialogModule,
  MatDialog,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';

import { AuthService, SalonAdminService, AddServiceDto } from '@org/shared-data-access';
import { SalonServiceItem } from '@org/models';

// ── Add Service Dialog ────────────────────────────────────────────────────────

@Component({
  selector: 'lib-add-service-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
  ],
  template: `
    <h2 mat-dialog-title>Add Service</h2>
    <mat-dialog-content>
      <form [formGroup]="form" class="dialog-form" novalidate>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Service name</mat-label>
          <input matInput formControlName="name" />
          @if (form.controls.name.invalid && form.controls.name.touched) {
            <mat-error>Service name is required.</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Category</mat-label>
          <mat-select formControlName="category">
            @for (cat of categories; track cat) {
              <mat-option [value]="cat">{{ cat }}</mat-option>
            }
          </mat-select>
          @if (form.controls.category.invalid && form.controls.category.touched) {
            <mat-error>Category is required.</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Description (optional)</mat-label>
          <textarea matInput formControlName="description" rows="2"></textarea>
        </mat-form-field>

        <div class="two-col">
          <mat-form-field appearance="outline">
            <mat-label>Price (LKR)</mat-label>
            <input matInput type="number" formControlName="price" min="0" />
            @if (form.controls.price.invalid && form.controls.price.touched) {
              <mat-error>Enter a valid price.</mat-error>
            }
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>Duration (min)</mat-label>
            <input matInput type="number" formControlName="duration" min="5" />
            @if (form.controls.duration.invalid && form.controls.duration.touched) {
              <mat-error>Enter a valid duration.</mat-error>
            }
          </mat-form-field>
        </div>

      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-stroked-button (click)="dialogRef.close()">Cancel</button>
      <button
        mat-flat-button
        color="primary"
        (click)="submit()"
      >
        Save Service
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .dialog-form { display: flex; flex-direction: column; gap: 4px; min-width: 340px; padding-top: 8px; }
    .full-width { width: 100%; }
    .two-col { display: flex; gap: 16px; }
    .two-col mat-form-field { flex: 1; }
  `],
})
export class AddServiceDialogComponent {
  private readonly fb = inject(FormBuilder);
  readonly dialogRef  = inject(MatDialogRef<AddServiceDialogComponent>);

  readonly categories = [
    'Hair Cut & Style',
    'Hair Colouring',
    'Manicure & Pedicure',
    'Facial & Skin Care',
    'Waxing',
    'Massage',
    'Makeup',
    'Beard & Shave',
    'Bridal',
    'Eyebrows & Lashes',
  ];

  readonly form = this.fb.nonNullable.group({
    name:        ['', Validators.required],
    category:    ['', Validators.required],
    description: [''],
    price:       [0, [Validators.required, Validators.min(0)]],
    duration:    [30, [Validators.required, Validators.min(5)]],
  });

  submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const { name, category, description, price, duration } = this.form.getRawValue();
    const dto: AddServiceDto = {
      name,
      category,
      description: description || undefined,
      price,
      duration,
    };
    this.dialogRef.close(dto);
  }
}

// ── Manage Services Component ─────────────────────────────────────────────────

@Component({
  selector: 'lib-manage-services',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DecimalPipe,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  template: `
    <div class="page-header">
      <div>
        <h1 class="page-title">Services</h1>
        <p class="page-subtitle">Manage the services your salon offers.</p>
      </div>
      <button mat-flat-button color="primary" (click)="openAddDialog()">
        <mat-icon>add</mat-icon>
        Add Service
      </button>
    </div>

    @if (isLoading()) {
      <div class="state-center"><mat-spinner diameter="36" /></div>
    } @else if (services().length === 0) {
      <div class="state-center state--empty">
        <mat-icon>content_cut</mat-icon>
        <p>No services yet. Add your first service.</p>
      </div>
    } @else {
      <div class="services-grid">
        @for (svc of services(); track svc._id) {
          <div class="service-card">
            <div class="svc-header">
              <div>
                <div class="svc-name">{{ svc.name }}</div>
                <div class="svc-category">{{ svc.category }}</div>
              </div>
              <div class="svc-actions">
                <button
                  mat-icon-button
                  color="warn"
                  [disabled]="deletingId() === svc._id"
                  (click)="deleteService(svc)"
                  matTooltip="Delete service"
                  aria-label="Delete service"
                >
                  @if (deletingId() === svc._id) {
                    <mat-spinner diameter="18" />
                  } @else {
                    <mat-icon>delete_outline</mat-icon>
                  }
                </button>
              </div>
            </div>

            @if (svc.description) {
              <p class="svc-desc">{{ svc.description }}</p>
            }

            <div class="svc-meta">
              <span class="svc-duration">
                <mat-icon>schedule</mat-icon>{{ svc.duration }} min
              </span>
              <span class="svc-price">LKR {{ svc.price | number }}</span>
            </div>
          </div>
        }
      </div>
    }
  `,
  styles: [`
    .page-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      margin-bottom: 28px;
      flex-wrap: wrap;
      gap: 12px;
    }

    .page-title  { font-size: 1.5rem; font-weight: 700; margin: 0 0 4px; color: #111827; }
    .page-subtitle { font-size: .85rem; color: #6b7280; margin: 0; }

    .state-center {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 14px;
      padding: 80px 24px;
      color: #9ca3af;
    }

    .state--empty mat-icon { font-size: 2.5rem; width: 2.5rem; height: 2.5rem; color: #d1d5db; }

    .services-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 16px;
    }

    .service-card {
      background: #fff;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      padding: 16px;
    }

    .svc-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; }
    .svc-name { font-weight: 600; font-size: .95rem; color: #111827; }
    .svc-category { font-size: .75rem; color: #9ca3af; margin-top: 2px; }
    .svc-actions { flex-shrink: 0; }
    .svc-desc { font-size: .82rem; color: #6b7280; margin: 0 0 12px; line-height: 1.5; }

    .svc-meta {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: .85rem;
    }

    .svc-duration {
      display: flex;
      align-items: center;
      gap: 4px;
      color: #6b7280;
    }

    .svc-duration mat-icon { font-size: .9rem; width: .9rem; height: .9rem; }
    .svc-price { font-weight: 700; color: var(--mat-sys-primary, #6750A4); }
  `],
})
export class ManageServicesComponent implements OnInit {
  private readonly adminService = inject(SalonAdminService);
  private readonly authService  = inject(AuthService);
  private readonly dialog       = inject(MatDialog);
  private readonly snack        = inject(MatSnackBar);

  readonly services  = signal<SalonServiceItem[]>([]);
  readonly isLoading = signal(true);
  readonly deletingId = signal<string | null>(null);

  private salonId = '';

  ngOnInit(): void {
    this.loadSalon();
  }

  private loadSalon(): void {
    this.adminService.getOwnSalon().subscribe({
      next: (salon) => {
        this.salonId = salon._id;
        this.services.set(salon.services);
        this.isLoading.set(false);
      },
      error: () => this.isLoading.set(false),
    });
  }

  openAddDialog(): void {
    const ref = this.dialog.open(AddServiceDialogComponent, {
      width: '420px',
      disableClose: true,
    });

    ref.afterClosed().subscribe((dto: AddServiceDto | undefined) => {
      if (!dto) return;
      this.adminService.addService(this.salonId, dto).subscribe({
        next: (svc) => {
          this.services.update((list) => [...list, svc]);
          this.snack.open('Service added!', 'OK', { duration: 3000 });
        },
        error: () => this.snack.open('Failed to add service.', 'Dismiss', { duration: 4000 }),
      });
    });
  }

  deleteService(svc: SalonServiceItem): void {
    if (!confirm(`Delete "${svc.name}"?`)) return;
    this.deletingId.set(svc._id);
    this.adminService.deleteService(this.salonId, svc._id).subscribe({
      next: () => {
        this.services.update((list) => list.filter((s) => s._id !== svc._id));
        this.deletingId.set(null);
        this.snack.open('Service deleted.', 'OK', { duration: 3000 });
      },
      error: () => {
        this.deletingId.set(null);
        this.snack.open('Failed to delete service.', 'Dismiss', { duration: 4000 });
      },
    });
  }
}
