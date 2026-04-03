import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';

import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DatePickerModule } from 'primeng/datepicker';
import { DividerModule } from 'primeng/divider';
import { FileUploadModule } from 'primeng/fileupload';
import { FloatLabelModule } from 'primeng/floatlabel';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { TabsModule } from 'primeng/tabs';
import { TextareaModule } from 'primeng/textarea';
import { ToastModule } from 'primeng/toast';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { FluidModule } from 'primeng/fluid';
import { TooltipModule } from 'primeng/tooltip';
import { ConfirmationService, MessageService } from 'primeng/api';

import {
  SalonAdminService,
  UpdateSalonInfoDto,
  UpdateOperatingHoursDto,
  SalonImage,
  PlanFeatureService,
} from '@org/shared-data-access';
import { Salon, SalonAddress } from '@org/models';
import { RouterLink } from '@angular/router';
import { SalonImageUploaderComponent } from '../salon-images/salon-image-uploader.component';

//  Constants

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

interface NotifChannel {
  email: boolean;
  sms:   boolean;
}

interface NotifSettings {
  newBooking:    NotifChannel;
  cancellation:  NotifChannel;
  reminder24h:   NotifChannel;
  weeklySummary: NotifChannel;
}

//

@Component({
  selector: 'lib-salon-settings',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [MessageService, ConfirmationService],
  imports: [
    RouterLink,
    ReactiveFormsModule,
    FormsModule,
    ButtonModule,
    CardModule,
    ConfirmDialogModule,
    DatePickerModule,
    DividerModule,
    FileUploadModule,
    FloatLabelModule,
    FluidModule,
    InputTextModule,
    MessageModule,
    ProgressSpinnerModule,
    TabsModule,
    TextareaModule,
    ToastModule,
    TooltipModule,
    ToggleSwitchModule,
    SalonImageUploaderComponent,
  ],
  templateUrl: './salon-settings.component.html',
})
export class SalonSettingsComponent implements OnInit {
  private readonly adminService    = inject(SalonAdminService);
  private readonly msgSvc          = inject(MessageService);
  private readonly confirmSvc      = inject(ConfirmationService);
  private readonly fb              = inject(FormBuilder);
  private readonly cdr             = inject(ChangeDetectorRef);
  readonly planFeature             = inject(PlanFeatureService);

  // ── Feature gates ────────────────────────────────────────────────────────
  readonly hasSms        = computed(() => this.planFeature.hasFeature('sms_notifications'));
  readonly hasGoogleCal  = computed(() => this.planFeature.hasFeature('google_calendar'));
  readonly hasWhatsApp   = computed(() => this.planFeature.hasFeature('whatsapp'));
  readonly hasInstagram = computed(() => this.planFeature.hasFeature('instagram'));

  readonly smsUpgradeMsg       = computed(() => `Upgrade to ${this.planFeature.requiredPlanFor('sms_notifications')} plan to use SMS`);
  readonly googleCalUpgradeMsg = computed(() => `Upgrade to ${this.planFeature.requiredPlanFor('google_calendar')} plan to sync Google Calendar`);
  readonly whatsAppUpgradeMsg  = computed(() => `Upgrade to ${this.planFeature.requiredPlanFor('whatsapp')} plan for WhatsApp integration`);
  readonly instagramUpgradeMsg = computed(() => `Upgrade to ${this.planFeature.requiredPlanFor('instagram')} plan for Instagram integration`);

  //  State
  readonly loading     = signal(true);
  protected salonId    = '';
  readonly salonImages = signal<SalonImage[]>([]);
  private currentAddress: { street: string; city: string; province: string; lat: number; lng: number } | null = null;

  readonly savingInfo  = signal(false);
  readonly savingHours = signal(false);
  readonly savingLogo  = signal(false);

  readonly logoPreview = signal<string | null>(null);
  readonly logoFile    = signal<File | null>(null);

  readonly notif = signal<NotifSettings>({
    newBooking:    { email: true,  sms: true  },
    cancellation:  { email: true,  sms: true  },
    reminder24h:   { email: true,  sms: true  },
    weeklySummary: { email: true,  sms: false },
  });

  //  Static data
  readonly dayConfigs = DAYS;

  readonly notifRows: Array<{
    key:    keyof NotifSettings;
    label:  string;
    desc:   string;
    hasSms: boolean;
  }> = [
    { key: 'newBooking',    label: 'New Booking',         desc: 'Alert when a client books an appointment',       hasSms: true  },
    { key: 'cancellation',  label: 'Cancellation',        desc: 'Alert when a booking is cancelled',              hasSms: true  },
    { key: 'reminder24h',   label: 'Reminder (24h)',      desc: 'Reminder sent 24 hours before an appointment',   hasSms: true  },
    { key: 'weeklySummary', label: 'Weekly Summary',      desc: "Email every Monday with last week's summary",    hasSms: false },
  ];

  //  Forms
  readonly infoForm = this.fb.group({
    name:                    ['', [Validators.required, Validators.maxLength(100)]],
    street:                  [''],
    city:                    [''],
    postcode:                [''],
    phone:                   ['', Validators.required],
    websiteUrl:              [''],
    description:             [''],
    autoConfirmBookings:     [false],
    cancellationWindowHours: [2, [Validators.required, Validators.min(0)]],
  });

  readonly hoursForm = this.fb.nonNullable.group({
    days: this.fb.array(
      DAYS.map(() =>
        this.fb.nonNullable.group({
          isOpen: [false],
          open:   [null as Date | null],
          close:  [null as Date | null],
        }),
      ),
    ),
  });

  //  Lifecycle
  ngOnInit(): void {
    this.adminService.getDashboardSalon().subscribe({
      next: (salon) => {
        this.salonId = salon._id;
        this.patchInfoForm(salon);
        this.patchHoursForm(salon);
        this.salonImages.set(salon.images ?? []);
        this.loading.set(false);
        this.cdr.markForCheck();
      },
      error: () => this.loading.set(false),
    });
  }

  //  Form helpers
  protected dayAt(i: number): FormGroup {
    return this.hoursForm.controls.days.at(i) as unknown as FormGroup;
  }

  private patchInfoForm(salon: Salon): void {
    // Store the full address including lat/lng/province to preserve them when saving
    // Note: Backend uses 'province', frontend model uses 'state'
    if (salon.address) {
      const addr = salon.address as SalonAddress & { province?: string; postcode?: string };
      this.currentAddress = {
        street: addr.street,
        city: addr.city,
        province: addr.province || addr.state || '',
        lat: addr.lat || 0,
        lng: addr.lng || 0,
      };
    }

    const addr = salon.address as SalonAddress & { province?: string; postcode?: string; postalCode?: string };
    this.infoForm.patchValue({
      name:                    salon.name,
      description:             salon.description ?? '',
      phone:                   salon.phone,
      street:                  addr?.street  ?? '',
      city:                    addr?.city    ?? '',
      postcode:                addr?.postcode ?? addr?.postalCode ?? '',
      websiteUrl:              (salon as unknown as { websiteUrl?: string })?.websiteUrl ?? '',
      autoConfirmBookings:     salon.autoConfirmBookings ?? false,
      cancellationWindowHours: salon.cancellationWindowHours ?? 2,
    });
  }

  private patchHoursForm(salon: Salon): void {
    DAYS.forEach((day, i) => {
      const h = salon.workingHours?.[day.key];
      if (h) {
        (this.hoursForm.controls.days.at(i) as unknown as FormGroup).patchValue({
          isOpen: h.isOpen,
          open:   this.parseTime(h.open),
          close:  this.parseTime(h.close),
        });
      }
    });
  }

  //  Photos
  onImagesChanged(images: SalonImage[]): void {
    this.salonImages.set(images);
  }

  //  Logo
  onLogoSelected(event: { files: File[] }): void {
    const file = event.files?.[0];
    if (!file) return;
    this.logoFile.set(file);
    const reader = new FileReader();
    reader.onload = () => {
      this.logoPreview.set(reader.result as string);
      this.cdr.markForCheck();
    };
    reader.readAsDataURL(file);
  }

  //  Save info
  saveInfo(): void {
    this.infoForm.markAllAsTouched();
    if (this.infoForm.invalid || !this.salonId) return;

    const v = this.infoForm.getRawValue();
    const dto: UpdateSalonInfoDto = {
      name:                    v.name        ?? undefined,
      description:             v.description || undefined,
      phone:                   v.phone       ?? undefined,
      address:                 this.currentAddress ? {
        street: v.street ?? this.currentAddress.street,
        city: v.city ?? this.currentAddress.city,
        province: this.currentAddress.province,
        lat: this.currentAddress.lat,
        lng: this.currentAddress.lng,
      } : undefined,
      autoConfirmBookings:     v.autoConfirmBookings ?? false,
      cancellationWindowHours: v.cancellationWindowHours ?? 2,
    };

    this.savingInfo.set(true);
    this.adminService.updateSalon(this.salonId, dto).subscribe({
      next: (updated) => {
        this.patchInfoForm(updated);
        this.savingInfo.set(false);
        this.toast('success', 'Business info saved');
      },
      error: (err) => {
        this.savingInfo.set(false);
        this.toast('error', (err?.error?.message as string) || 'Failed to save info');
      },
    });
  }

  //  Save hours
  saveHours(): void {
    if (!this.salonId) return;
    const dto: UpdateOperatingHoursDto = {};

    this.hoursForm.controls.days.controls.forEach((ctrl, i) => {
      const { isOpen, open, close } = ctrl.getRawValue();
      dto[DAYS[i].key as DayKey] = {
        isOpen,
        open:  this.formatTime(open),
        close: this.formatTime(close),
      };
    });

    this.savingHours.set(true);
    this.adminService.updateOperatingHours(this.salonId, dto).subscribe({
      next: () => { this.savingHours.set(false); this.toast('success', 'Opening hours saved'); },
      error: () => { this.savingHours.set(false); this.toast('error', 'Failed to save hours'); },
    });
  }

  //  Notifications
  setNotif(key: keyof NotifSettings, channel: 'email' | 'sms', value: boolean): void {
    this.notif.update((n) => ({
      ...n,
      [key]: { ...n[key], [channel]: value },
    }));
  }

  //  Danger zone
  confirmDeleteAccount(): void {
    this.confirmSvc.confirm({
      header:                  'Delete Account',
      message:                 'This will permanently delete your salon, all bookings, and staff records. This action cannot be undone.',
      icon:                    'pi pi-exclamation-triangle',
      acceptLabel:             'Yes, delete',
      rejectLabel:             'Cancel',
      acceptButtonStyleClass:  'p-button-danger',
      accept: () => {
        this.toast('info', 'Account deletion requested  feature coming soon.');
      },
    });
  }

  //  Validation helpers
  infoError(field: string): string | null {
    const ctrl = this.infoForm.get(field);
    if (!ctrl?.touched || ctrl.valid) return null;
    if (ctrl.hasError('required'))   return 'This field is required';
    if (ctrl.hasError('email'))      return 'Enter a valid email address';
    if (ctrl.hasError('maxlength'))  return 'Too long';
    return null;
  }

  //  Time utilities
  private parseTime(t: string | undefined | null): Date | null {
    if (!t) return null;
    const [h, m] = t.split(':').map(Number);
    const d = new Date();
    d.setHours(h ?? 9, m ?? 0, 0, 0);
    return d;
  }

  private formatTime(d: Date | null | undefined): string {
    if (!d) return '00:00';
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  //  Toast
  private toast(severity: 'success' | 'error' | 'info' | 'warn', detail: string): void {
    this.msgSvc.add({ severity, summary: severity === 'error' ? 'Error' : 'Done', detail, life: 3500 });
  }
}
