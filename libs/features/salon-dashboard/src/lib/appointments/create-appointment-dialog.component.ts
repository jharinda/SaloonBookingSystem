import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
  signal,
  inject,
  computed,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AutoComplete } from 'primeng/autocomplete';
import { Button } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { MultiSelect } from 'primeng/multiselect';
import { Select } from 'primeng/select';
import { Textarea } from 'primeng/textarea';
import { Toast } from 'primeng/toast';
import { MessageService } from 'primeng/api';

import { Salon, SalonServiceItem } from '@org/models';
import {
  SalonAdminService,
  SalonStaffMember,
  ClientSearchResult,
} from '@org/shared-data-access';

export interface CreateAppointmentContext {
  time: string;
  stationId: string;
  stationName: string;
  date: Date;
}

@Component({
  selector: 'lib-create-appointment-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    AutoComplete,
    Button,
    DialogModule,
    MultiSelect,
    Select,
    Textarea,
    Toast,
  ],
  providers: [MessageService],
  template: `
    <p-toast position="top-center" />
    <p-dialog
      [visible]="visible()"
      (visibleChange)="onVisibleChange($event)"
      header="Create Appointment"
      [modal]="true"
      [style]="{ width: '520px' }"
      [closable]="true"
    >
      <div class="flex flex-col gap-4 pt-2">
        <!-- Slot info -->
        <div class="flex items-center gap-4 p-3 rounded-lg bg-surface-100 dark:bg-surface-800">
          <div class="flex items-center gap-2">
            <i class="pi pi-calendar text-primary"></i>
            <span class="font-medium">{{ formatDate(context()?.date) }}</span>
          </div>
          <div class="flex items-center gap-2">
            <i class="pi pi-clock text-primary"></i>
            <span class="font-medium">{{ context()?.time }}</span>
          </div>
          <div class="flex items-center gap-2">
            <i class="pi pi-building text-primary"></i>
            <span class="font-medium">{{ context()?.stationName }}</span>
          </div>
        </div>

        <!-- Past slot warning -->
        @if (isPastSlot()) {
          <div class="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300">
            <i class="pi pi-exclamation-triangle text-lg shrink-0"></i>
            <span class="text-sm font-medium">This time slot has already passed. Appointments cannot be created in the past.</span>
          </div>
        }

        <!-- Client search -->
        <div class="flex flex-col gap-1">
          <label class="font-medium text-sm">Client <span class="text-red-500">*</span></label>
          <p-autoComplete
            [ngModel]="selectedClient()"
            (ngModelChange)="selectedClient.set($event)"
            [suggestions]="clientSuggestions()"
            (completeMethod)="searchClient($event)"
            [minLength]="2"
            placeholder="Search by name, email or phone..."
            [forceSelection]="true"
            styleClass="w-full"
            optionLabel="email"
          >
            <ng-template let-client pTemplate="item">
              <div class="flex items-center gap-3 py-1">
                @if (client.avatarUrl) {
                  <img [src]="client.avatarUrl" class="w-8 h-8 rounded-full object-cover" alt="" />
                } @else {
                  <div class="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                    {{ client.firstName?.charAt(0) }}{{ client.lastName?.charAt(0) }}
                  </div>
                }
                <div class="flex flex-col">
                  <span class="font-medium">{{ client.firstName }} {{ client.lastName }}</span>
                  <span class="text-sm text-surface-500">{{ client.email }}{{ client.phone ? ' · ' + client.phone : '' }}</span>
                </div>
              </div>
            </ng-template>
            <ng-template let-client pTemplate="selectedItem">
              <span>{{ client.firstName }} {{ client.lastName }} ({{ client.email }})</span>
            </ng-template>
          </p-autoComplete>
        </div>

        <!-- Services -->
        <div class="flex flex-col gap-1">
          <label class="font-medium text-sm">Services <span class="text-red-500">*</span></label>
          <p-multiSelect
            [options]="serviceOptions()"
            [ngModel]="selectedServices()"
            (ngModelChange)="selectedServices.set($event)"
            optionLabel="name"
            placeholder="Select services"
            [filter]="true"
            filterPlaceholder="Search services..."
            [showToggleAll]="false"
            styleClass="w-full"
          >
            <ng-template let-service pTemplate="item">
              <div class="flex justify-between w-full items-center">
                <span>{{ service.name }}</span>
                <span class="text-sm text-surface-500 ml-2">{{ service.duration }}min</span>
              </div>
            </ng-template>
          </p-multiSelect>
        </div>

        <!-- Stylist -->
        <div class="flex flex-col gap-1">
          <label class="font-medium text-sm">Stylist</label>
          <p-select
            [options]="stylistOptions()"
            [ngModel]="selectedStylistId()"
            (ngModelChange)="selectedStylistId.set($event)"
            optionLabel="label"
            optionValue="value"
            placeholder="Any available stylist"
            [showClear]="true"
            styleClass="w-full"
          />
        </div>

        <!-- Notes -->
        <div class="flex flex-col gap-1">
          <label class="font-medium text-sm">Notes</label>
          <textarea
            pTextarea
            [ngModel]="notes()"
            (ngModelChange)="notes.set($event)"
            rows="2"
            class="w-full"
            placeholder="Optional notes..."
          ></textarea>
        </div>

        <!-- Summary -->
        @if (selectedServices().length > 0) {
          <div class="p-3 rounded-lg bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700">
            <div class="text-sm font-medium mb-2">Summary</div>
            <div class="flex justify-between text-sm">
              <span>Total Duration</span>
              <span class="font-medium">{{ totalDuration() }} min</span>
            </div>
            <div class="flex justify-between text-sm mt-1">
              <span>End Time</span>
              <span class="font-medium">{{ calculatedEndTime() }}</span>
            </div>
            <div class="flex justify-between text-sm mt-1">
              <span>Total Price</span>
              <span class="font-medium">{{ totalPrice() }}</span>
            </div>
          </div>
        }
      </div>

      <ng-template pTemplate="footer">
        <div class="flex justify-end gap-2">
          <p-button
            label="Cancel"
            severity="secondary"
            [text]="true"
            (onClick)="onVisibleChange(false)"
          />
          <p-button
            label="Create Appointment"
            icon="pi pi-check"
            [loading]="submitting()"
            [disabled]="!canSubmit()"
            (onClick)="submit()"
          />
        </div>
      </ng-template>
    </p-dialog>
  `,
})
export class CreateAppointmentDialogComponent {
  private readonly salonService = inject(SalonAdminService);
  private readonly messageService = inject(MessageService);

  visible = input.required<boolean>();
  context = input.required<CreateAppointmentContext | null>();
  salon = input.required<Salon>();
  staffMembers = input.required<SalonStaffMember[]>();

  visibleChange = output<boolean>();
  appointmentCreated = output<void>();

  // All form state as signals so computed() can track them
  selectedClient = signal<ClientSearchResult | null>(null);
  selectedServices = signal<SalonServiceItem[]>([]);
  selectedStylistId = signal<string | null>(null);
  notes = signal('');

  clientSuggestions = signal<ClientSearchResult[]>([]);
  submitting = signal(false);

  serviceOptions = computed(() =>
    this.salon().services?.filter((s) => s.active !== false) ?? [],
  );

  stylistOptions = computed(() =>
    this.staffMembers().map((s) => ({
      label: `${s.firstName} ${s.lastName}`,
      value: s._id,
    })),
  );

  totalDuration = computed(() =>
    this.selectedServices().reduce((sum, s) => sum + s.duration, 0),
  );

  totalPrice = computed(() =>
    this.selectedServices().reduce((sum, s) => sum + s.price, 0),
  );

  calculatedEndTime = computed(() => {
    const ctx = this.context();
    if (!ctx) return '';
    const [h, m] = ctx.time.split(':').map(Number);
    const endMin = h * 60 + m + this.totalDuration();
    const eH = Math.floor(endMin / 60).toString().padStart(2, '0');
    const eM = (endMin % 60).toString().padStart(2, '0');
    return `${eH}:${eM}`;
  });

  isPastSlot = computed(() => {
    const ctx = this.context();
    if (!ctx) return false;
    const [h, m] = ctx.time.split(':').map(Number);
    const slotDateTime = new Date(
      ctx.date.getFullYear(), ctx.date.getMonth(), ctx.date.getDate(), h, m, 0, 0,
    );
    return slotDateTime < new Date();
  });

  canSubmit = computed(
    () =>
      this.selectedClient() !== null &&
      this.selectedServices().length > 0 &&
      !this.submitting() &&
      !this.isPastSlot(),
  );

  // Reset form when dialog is closed
  private resetOnClose = effect(() => {
    if (!this.visible()) {
      this._reset();
    }
  });

  searchClient(event: { query: string }): void {
    const q = event.query?.trim();
    if (!q || q.length < 2) {
      this.clientSuggestions.set([]);
      return;
    }
    this.salonService.searchClients(q).subscribe({
      next: (results) => this.clientSuggestions.set(results),
      error: () => this.clientSuggestions.set([]),
    });
  }

  submit(): void {
    const ctx = this.context();
    const client = this.selectedClient();
    const services = this.selectedServices();
    if (!ctx || !client || services.length === 0) return;

    this.submitting.set(true);

    const salon = this.salon();
    const dateStr = this._fmtDate(ctx.date);

    this.salonService
      .createManualBooking({
        clientId: client.userId,
        clientName: `${client.firstName} ${client.lastName}`,
        salonId: salon._id,
        salonName: salon.name,
        stylistId: this.selectedStylistId() ?? undefined,
        services: services.map((s) => ({
          serviceId: s._id,
          name: s.name,
          price: s.price,
          durationMinutes: s.duration,
        })),
        appointmentDate: dateStr,
        startTime: ctx.time,
        notes: this.notes() || undefined,
      })
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.appointmentCreated.emit();
          this._reset();
          this.visibleChange.emit(false);
        },
        error: (err) => {
          this.submitting.set(false);
          this.messageService.add({
            severity: 'error',
            summary: 'Failed',
            detail:
              err?.error?.message ||
              'Could not create the appointment. Please try again.',
            life: 5000,
          });
        },
      });
  }

  onVisibleChange(visible: boolean): void {
    this.visibleChange.emit(visible);
  }

  formatDate(date: Date | undefined): string {
    if (!date) return '';
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  }

  private _reset(): void {
    this.selectedClient.set(null);
    this.selectedServices.set([]);
    this.selectedStylistId.set(null);
    this.notes.set('');
    this.clientSuggestions.set([]);
  }

  private _fmtDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
}
