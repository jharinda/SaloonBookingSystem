import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import {
  ReactiveFormsModule,
  FormsModule,
  FormBuilder,
  Validators,
} from '@angular/forms';
import { DecimalPipe } from '@angular/common';

import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ToastModule } from 'primeng/toast';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { ToolbarModule } from 'primeng/toolbar';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { FloatLabelModule } from 'primeng/floatlabel';
import { FluidModule } from 'primeng/fluid';
import { TooltipModule } from 'primeng/tooltip';
import { ConfirmationService, MessageService } from 'primeng/api';

import { SalonAdminService, AddServiceDto } from '@org/shared-data-access';
import { SalonServiceItem } from '@org/models';

const SERVICE_CATEGORIES = ['Hair', 'Nails', 'Skin', 'Massage', 'Spa', 'Lashes', 'Brows'];

@Component({
  selector: 'lib-manage-services',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ConfirmationService, MessageService],
  imports: [
    ReactiveFormsModule,
    FormsModule,
    DecimalPipe,
    TableModule,
    ButtonModule,
    DialogModule,
    InputTextModule,
    InputNumberModule,
    SelectModule,
    ConfirmDialogModule,
    ToastModule,
    ProgressSpinnerModule,
    ToolbarModule,
    ToggleSwitchModule,
    FloatLabelModule,
    FluidModule,
    TooltipModule,
  ],
  templateUrl: './manage-services.component.html',
})
export class ManageServicesComponent implements OnInit {
  private readonly adminService = inject(SalonAdminService);
  private readonly confirmSvc   = inject(ConfirmationService);
  private readonly msgSvc       = inject(MessageService);
  private readonly fb           = inject(FormBuilder);

  readonly services       = signal<SalonServiceItem[]>([]);
  readonly isLoading      = signal(true);
  readonly deletingId     = signal<string | null>(null);
  readonly isSaving       = signal(false);
  readonly editingService = signal<SalonServiceItem | null>(null);

  dialogVisible = false;

  readonly dialogTitle = computed(() =>
    this.editingService() ? 'Edit Service' : 'Add Service',
  );

  readonly categoryOptions = SERVICE_CATEGORIES.map((c) => ({ label: c, value: c }));

  readonly form = this.fb.nonNullable.group({
    name:     ['', Validators.required],
    category: ['', Validators.required],
    duration: [30, [Validators.required, Validators.min(5)]],
    price:    [0,  [Validators.required, Validators.min(0)]],
    active:   [true],
  });

  private salonId = '';

  ngOnInit(): void {
    this.adminService.getOwnSalon().subscribe({
      next: (salon) => {
        this.salonId = salon._id;
        this.services.set(salon.services);
        this.isLoading.set(false);
      },
      error: () => this.isLoading.set(false),
    });
  }

  openDialog(svc?: SalonServiceItem): void {
    this.editingService.set(svc ?? null);
    this.form.reset({
      name:     svc?.name     ?? '',
      category: svc?.category ?? '',
      duration: svc?.duration ?? 30,
      price:    svc?.price    ?? 0,
      active:   svc?.active   ?? true,
    });
    this.dialogVisible = true;
  }

  saveService(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    const raw = this.form.getRawValue();
    const dto: AddServiceDto = {
      name:     raw.name,
      category: raw.category,
      duration: raw.duration,
      price:    raw.price,
      active:   raw.active,
    };
    this.isSaving.set(true);

    const editing = this.editingService();
    const request$ = editing
      ? this.adminService.updateService(this.salonId, editing._id, dto)
      : this.adminService.addService(this.salonId, dto);

    request$.subscribe({
      next: (services) => {
        this.services.set(services);
        this.msgSvc.add({
          severity: 'success',
          summary: editing ? 'Updated' : 'Added',
          detail:  editing ? 'Service updated.' : 'Service added.',
        });
        this.isSaving.set(false);
        this.dialogVisible = false;
        this.editingService.set(null);
        this.form.reset();
      },
      error: () => {
        this.msgSvc.add({ severity: 'error', summary: 'Error', detail: 'Failed to save service.' });
        this.isSaving.set(false);
      },
    });
  }

  toggleActive(svc: SalonServiceItem): void {
    const newActive = !(svc.active ?? true);
    // optimistic update
    this.services.update((list) =>
      list.map((s) => (s._id === svc._id ? { ...s, active: newActive } : s)),
    );
    this.adminService.updateService(this.salonId, svc._id, { active: newActive }).subscribe({
      next: (services) => this.services.set(services),
      error: () => {
        // revert
        this.services.update((list) => list.map((s) => (s._id === svc._id ? svc : s)));
        this.msgSvc.add({ severity: 'error', summary: 'Error', detail: 'Failed to update status.' });
      },
    });
  }

  confirmDelete(svc: SalonServiceItem): void {
    this.confirmSvc.confirm({
      message: 'Are you sure you want to delete this service?',
      header: 'Delete Service',
      icon: 'pi pi-exclamation-triangle',
      acceptButtonProps: { severity: 'danger', label: 'Delete', icon: 'pi pi-trash' },
      rejectButtonProps: { severity: 'secondary', label: 'Cancel', text: true },
      accept: () => this.doDelete(svc),
    });
  }

  private doDelete(svc: SalonServiceItem): void {
    this.deletingId.set(svc._id);
    this.adminService.deleteService(this.salonId, svc._id).subscribe({
      next: () => {
        this.services.update((list) => list.filter((s) => s._id !== svc._id));
        this.deletingId.set(null);
        this.msgSvc.add({ severity: 'success', summary: 'Deleted', detail: 'Service deleted.' });
      },
      error: () => {
        this.deletingId.set(null);
        this.msgSvc.add({ severity: 'error', summary: 'Error', detail: 'Failed to delete service.' });
      },
    });
  }
}
