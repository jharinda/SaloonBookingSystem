import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  FormsModule,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { DatePipe } from '@angular/common';
import { Router } from '@angular/router';

import { CardModule } from 'primeng/card';
import { TabsModule } from 'primeng/tabs';
import { AvatarModule } from 'primeng/avatar';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { DividerModule } from 'primeng/divider';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DialogModule } from 'primeng/dialog';
import { ConfirmationService, MessageService } from 'primeng/api';

import { AuthService, BookingService } from '@org/shared-data-access';
import {
  NotificationPreferences,
  UserProfile,
  UserService,
  ConnectedAccounts,
} from '@org/shared-data-access';
import { Booking, BookingStatus } from '@org/models';

//  Validators 

const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_\-+=[\]{}|;':",.<>?/`~])/;

const passwordComplexity: ValidatorFn = (ctrl: AbstractControl): ValidationErrors | null =>
  ctrl.value && !PASSWORD_PATTERN.test(ctrl.value as string) ? { complexity: true } : null;

function confirmPasswordMatch(group: AbstractControl): ValidationErrors | null {
  const pw  = group.get('newPassword')?.value as string;
  const cpw = group.get('confirmPassword')?.value as string;
  return pw && cpw && pw !== cpw ? { mismatch: true } : null;
}

const SL_PHONE = /^(\+94)?[0-9]{9,10}$/;

type StatusSeverity = 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast';

const STATUS_SEVERITY: Record<BookingStatus, StatusSeverity> = {
  PENDING:     'warn',
  CONFIRMED:   'info',
  IN_PROGRESS: 'contrast',
  COMPLETED:   'success',
  CANCELLED:   'danger',
  NO_SHOW:     'secondary',
};

// 

@Component({
  selector: 'lib-account',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ConfirmationService, MessageService],
  imports: [
    ReactiveFormsModule,
    FormsModule,
    DatePipe,
    CardModule,
    TabsModule,
    AvatarModule,
    ButtonModule,
    InputTextModule,
    PasswordModule,
    SelectModule,
    TableModule,
    TagModule,
    ToggleSwitchModule,
    ProgressSpinnerModule,
    DividerModule,
    ToastModule,
    ConfirmDialogModule,
    DialogModule,
  ],
  template: `
    <p-toast />
    <p-confirmDialog />

    <!-- Delete confirmation dialog with typed "DELETE" requirement -->
    <p-dialog
      [(visible)]="deleteDialogVisible"
      header="Delete Account"
      [modal]="true"
      [style]="{ width: '420px' }"
      [closable]="!deletingAccount()"
    >
      <div class="flex flex-col gap-4">
        <div class="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg p-4">
          <i class="pi pi-exclamation-triangle text-red-600 text-xl shrink-0 mt-0.5"></i>
          <p class="text-sm text-red-700 m-0 leading-relaxed">
            This action is <strong>permanent and irreversible</strong>. All your bookings,
            reviews, and personal data will be deleted immediately.
          </p>
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-medium text-gray-700">
            Type <strong class="text-red-600">DELETE</strong> to confirm
          </label>
          <input
            pInputText
            [(ngModel)]="deleteConfirmText"
            placeholder="DELETE"
            autocomplete="off"
            class="w-full"
          />
        </div>
      </div>
      <ng-template pTemplate="footer">
        <p-button
          label="Cancel"
          [text]="true"
          severity="secondary"
          (onClick)="deleteDialogVisible = false"
          [disabled]="deletingAccount()"
        />
        <p-button
          label="Delete My Account"
          icon="pi pi-trash"
          severity="danger"
          [disabled]="deleteConfirmText !== 'DELETE'"
          [loading]="deletingAccount()"
          (onClick)="doDeleteAccount()"
        />
      </ng-template>
    </p-dialog>

    <!--  Page  -->
    <div class="min-h-screen bg-gray-50 py-8 px-4">
      <div class="max-w-2xl mx-auto">

        <h1 class="text-2xl font-bold text-gray-900 mb-6">Account Settings</h1>

        @if (loading()) {
          <div class="flex items-center justify-center gap-3 py-24 text-gray-400">
            <p-progressSpinner styleClass="w-10 h-10" strokeWidth="4" />
            <span>Loading profile</span>
          </div>
        } @else {

          <p-card styleClass="shadow-sm border border-gray-100">
            <p-tabs value="profile">

              <p-tablist>
                <p-tab value="profile">
                  <i class="pi pi-user mr-2"></i>Profile
                </p-tab>
                <p-tab value="security">
                  <i class="pi pi-lock mr-2"></i>Security
                </p-tab>
                <p-tab value="notifications">
                  <i class="pi pi-bell mr-2"></i>Notifications
                </p-tab>
              </p-tablist>

              <p-tabpanels>

                <!--  PROFILE TAB  -->
                <p-tabpanel value="profile">
                  <div class="flex flex-col gap-6 pt-4">

                    <!-- Avatar + upload -->
                    <div class="flex items-center gap-5">
                      @if (avatarPreview() || profile()?.avatarUrl; as src) {
                        <p-avatar
                          [image]="src"
                          size="xlarge"
                          shape="circle"
                          styleClass="shrink-0 border-2 border-purple-200"
                        />
                      } @else {
                        <p-avatar
                          [label]="initials()"
                          size="xlarge"
                          shape="circle"
                          styleClass="shrink-0 bg-purple-100 text-purple-700 font-bold text-xl border-2 border-purple-200"
                        />
                      }

                      <div class="flex flex-col gap-2">
                        <label
                          class="flex items-center gap-2 cursor-pointer text-sm font-medium text-purple-700 border border-purple-300 hover:bg-purple-50 rounded-lg px-4 py-2 transition-colors"
                        >
                          <i class="pi pi-camera"></i>
                          Change Photo
                          <input
                            type="file"
                            accept="image/*"
                            class="hidden"
                            (change)="onAvatarFileChange($event)"
                          />
                        </label>
                        @if (avatarFile()) {
                          <p-button
                            label="Upload"
                            icon="pi pi-cloud-upload"
                            size="small"
                            [outlined]="true"
                            [loading]="savingAvatar()"
                            (onClick)="uploadAvatar()"
                          />
                        }
                      </div>
                    </div>

                    <p-divider styleClass="my-0" />

                    <!-- Personal information form -->
                    <div [formGroup]="profileForm" class="flex flex-col gap-4">
                      <h3 class="text-base font-semibold text-gray-800 m-0">Personal Information</h3>

                      <!-- Name row -->
                      <div class="grid grid-cols-2 gap-3">
                        <div class="flex flex-col gap-1">
                          <label class="text-sm font-medium text-gray-700">First Name *</label>
                          <input
                            pInputText
                            formControlName="firstName"
                            autocomplete="given-name"
                            class="w-full"
                            [class.ng-invalid]="profileError('firstName')"
                            [class.ng-dirty]="profileForm.controls.firstName.touched"
                          />
                          @if (profileError('firstName'); as err) {
                            <small class="text-red-500">{{ err }}</small>
                          }
                        </div>
                        <div class="flex flex-col gap-1">
                          <label class="text-sm font-medium text-gray-700">Last Name *</label>
                          <input
                            pInputText
                            formControlName="lastName"
                            autocomplete="family-name"
                            class="w-full"
                            [class.ng-invalid]="profileError('lastName')"
                            [class.ng-dirty]="profileForm.controls.lastName.touched"
                          />
                          @if (profileError('lastName'); as err) {
                            <small class="text-red-500">{{ err }}</small>
                          }
                        </div>
                      </div>

                      <!-- Phone -->
                      <div class="flex flex-col gap-1">
                        <label class="text-sm font-medium text-gray-700">Phone</label>
                        <div class="p-inputgroup">
                          <span class="p-inputgroup-addon"><i class="pi pi-phone"></i></span>
                          <input
                            pInputText
                            formControlName="phone"
                            placeholder="+94XXXXXXXXX"
                            autocomplete="tel"
                            class="flex-1"
                          />
                        </div>
                        <small class="text-gray-400">Sri Lanka format: +94XXXXXXXXX</small>
                        @if (profileError('phone'); as err) {
                          <small class="text-red-500">{{ err }}</small>
                        }
                      </div>

                      <!-- Email (read-only) -->
                      <div class="flex flex-col gap-1">
                        <label class="text-sm font-medium text-gray-700">Email Address</label>
                        <div class="p-inputgroup">
                          <span class="p-inputgroup-addon"><i class="pi pi-envelope"></i></span>
                          <input
                            pInputText
                            formControlName="email"
                            autocomplete="email"
                            class="flex-1 bg-gray-50"
                            readonly
                          />
                        </div>
                        <small class="text-gray-400">Email cannot be changed. Contact support if needed.</small>
                      </div>

                      <!-- Preferences row -->
                      <div class="grid grid-cols-2 gap-3">
                        <div class="flex flex-col gap-1">
                          <label class="text-sm font-medium text-gray-700">Preferred Language</label>
                          <p-select
                            formControlName="preferredLanguage"
                            [options]="languageOptions"
                            optionLabel="label"
                            optionValue="value"
                            styleClass="w-full"
                          />
                        </div>
                        <div class="flex flex-col gap-1">
                          <label class="text-sm font-medium text-gray-700">Preferred Contact</label>
                          <p-select
                            formControlName="preferredContact"
                            [options]="contactOptions"
                            optionLabel="label"
                            optionValue="value"
                            styleClass="w-full"
                          />
                        </div>
                      </div>

                      <!-- Save button -->
                      <div class="flex justify-end pt-2">
                        <p-button
                          label="Save Changes"
                          icon="pi pi-save"
                          [loading]="savingProfile()"
                          (onClick)="saveProfile()"
                        />
                      </div>
                    </div>

                    <p-divider styleClass="my-0" />

                    <!-- Booking history -->
                    <div class="flex flex-col gap-3">
                      <h3 class="text-base font-semibold text-gray-800 m-0">Recent Bookings</h3>

                      @if (bookingsLoading()) {
                        <div class="flex items-center gap-2 text-gray-400 text-sm py-4">
                          <p-progressSpinner styleClass="w-5 h-5" strokeWidth="4" />
                          <span>Loading history</span>
                        </div>
                      } @else if (recentBookings().length === 0) {
                        <div class="flex items-center gap-2 text-gray-400 text-sm py-4">
                          <i class="pi pi-calendar"></i>
                          <span>No bookings yet.</span>
                        </div>
                      } @else {
                        <p-table
                          [value]="recentBookings()"
                          styleClass="p-datatable-sm"
                          [responsiveLayout]="'scroll'"
                        >
                          <ng-template pTemplate="header">
                            <tr>
                              <th>Date</th>
                              <th>Salon</th>
                              <th>Service</th>
                              <th>Status</th>
                            </tr>
                          </ng-template>
                          <ng-template pTemplate="body" let-b>
                            <tr>
                              <td class="text-sm text-gray-700 whitespace-nowrap">
                                {{ b.appointmentDate | date:'d MMM y' }}
                              </td>
                              <td class="text-sm text-gray-700">{{ b.salonName }}</td>
                              <td class="text-sm text-gray-700">{{ b.serviceName }}</td>
                              <td>
                                <p-tag
                                  [value]="b.status"
                                  [severity]="statusSeverity(b.status)"
                                  styleClass="text-xs"
                                />
                              </td>
                            </tr>
                          </ng-template>
                        </p-table>
                      }
                    </div>

                  </div>
                </p-tabpanel>

                <!--  SECURITY TAB  -->
                <p-tabpanel value="security">
                  <div class="flex flex-col gap-6 pt-4">

                    <!-- Change password -->
                    <div [formGroup]="passwordForm" class="flex flex-col gap-4">
                      <h3 class="text-base font-semibold text-gray-800 m-0">Change Password</h3>

                      <div class="flex flex-col gap-1">
                        <label class="text-sm font-medium text-gray-700">Current Password *</label>
                        <p-password
                          formControlName="currentPassword"
                          [feedback]="false"
                          [toggleMask]="true"
                          styleClass="w-full"
                          inputStyleClass="w-full"
                          autocomplete="current-password"
                          [class.ng-invalid]="passwordError('currentPassword')"
                          [class.ng-dirty]="passwordForm.controls.currentPassword.touched"
                        />
                        @if (passwordError('currentPassword'); as err) {
                          <small class="text-red-500">{{ err }}</small>
                        }
                      </div>

                      <div class="flex flex-col gap-1">
                        <label class="text-sm font-medium text-gray-700">New Password *</label>
                        <p-password
                          formControlName="newPassword"
                          [feedback]="true"
                          [toggleMask]="true"
                          styleClass="w-full"
                          inputStyleClass="w-full"
                          autocomplete="new-password"
                          [class.ng-invalid]="passwordError('newPassword')"
                          [class.ng-dirty]="passwordForm.controls.newPassword.touched"
                        />
                        <small class="text-gray-400">Min 8 chars  uppercase  lowercase  number  special character</small>
                        @if (passwordError('newPassword'); as err) {
                          <small class="text-red-500">{{ err }}</small>
                        }
                      </div>

                      <div class="flex flex-col gap-1">
                        <label class="text-sm font-medium text-gray-700">Confirm New Password *</label>
                        <p-password
                          formControlName="confirmPassword"
                          [feedback]="false"
                          [toggleMask]="true"
                          styleClass="w-full"
                          inputStyleClass="w-full"
                          autocomplete="new-password"
                          [class.ng-invalid]="passwordError('confirmPassword')"
                          [class.ng-dirty]="passwordForm.controls.confirmPassword.touched"
                        />
                        @if (passwordError('confirmPassword'); as err) {
                          <small class="text-red-500">{{ err }}</small>
                        }
                      </div>

                      <div class="flex justify-end pt-2">
                        <p-button
                          label="Update Password"
                          icon="pi pi-key"
                          [loading]="savingPassword()"
                          (onClick)="changePassword()"
                        />
                      </div>
                    </div>

                    <p-divider styleClass="my-0" />

                    <!-- Connected accounts -->
                    <div class="flex flex-col gap-3">
                      <h3 class="text-base font-semibold text-gray-800 m-0">Connected Accounts</h3>
                      <p class="text-sm text-gray-500 m-0">Link third-party accounts for faster sign-in.</p>

                      <div class="flex items-center justify-between p-4 border border-gray-200 rounded-xl">
                        <div class="flex items-center gap-3">
                          <svg class="w-6 h-6" viewBox="0 0 48 48">
                            <path fill="#FFC107" d="M43.6 20H24v8h11.3C33.7 33.6 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.7 1.1 7.8 2.9L37.9 9A20 20 0 1 0 44 24c0-1.4-.1-2.7-.4-4z"/>
                            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 16 19 12 24 12c3 0 5.7 1.1 7.8 2.9L37.9 9A20 20 0 0 0 6.3 14.7z"/>
                            <path fill="#4CAF50" d="M24 44a20 20 0 0 0 13.4-5.2l-6.2-5.2C29.3 35.3 26.8 36 24 36c-5.3 0-9.7-3.4-11.3-8.1l-6.5 5C9.2 40.5 16 44 24 44z"/>
                            <path fill="#1976D2" d="M43.6 20H24v8h11.3c-.8 2.2-2.3 4-4.2 5.4l6.2 5.2C40.8 35.7 44 30.3 44 24c0-1.4-.1-2.7-.4-4z"/>
                          </svg>
                          <div>
                            <p class="font-medium text-gray-900 text-sm m-0">Google</p>
                            @if (connectedAccounts().google; as g) {
                              <p class="text-xs text-gray-500 m-0">{{ g.email }}</p>
                            } @else {
                              <p class="text-xs text-gray-400 m-0">Not connected</p>
                            }
                          </div>
                        </div>
                        @if (connectedAccounts().google) {
                          <p-button
                            label="Disconnect"
                            [text]="true"
                            severity="danger"
                            size="small"
                            [loading]="disconnectingGoogle()"
                            (onClick)="disconnectGoogle()"
                          />
                        } @else {
                          <p-button
                            label="Connect Google"
                            icon="pi pi-google"
                            size="small"
                            [outlined]="true"
                            (onClick)="connectGoogle()"
                          />
                        }
                      </div>
                    </div>

                  </div>
                </p-tabpanel>

                <!--  NOTIFICATIONS TAB  -->
                <p-tabpanel value="notifications">
                  <div class="flex flex-col gap-0 pt-4">
                    <h3 class="text-base font-semibold text-gray-800 m-0 mb-1">Notification Preferences</h3>
                    <p class="text-sm text-gray-500 mb-4 mt-0">Choose how you want to be notified about your appointments.</p>

                    @for (row of notifRows; track row.key) {
                      <div class="flex items-center justify-between py-4 border-b border-gray-100 last:border-0">
                        <div class="flex items-center gap-3">
                          <span class="w-9 h-9 rounded-full bg-purple-50 flex items-center justify-center shrink-0">
                            <i [class]="row.icon + ' text-purple-600'"></i>
                          </span>
                          <div>
                            <p class="font-medium text-gray-900 text-sm m-0">{{ row.label }}</p>
                            <p class="text-xs text-gray-500 m-0">{{ row.desc }}</p>
                          </div>
                        </div>
                        <p-toggleSwitch
                          [ngModel]="notifPrefs()[row.key]"
                          (ngModelChange)="onNotifToggle(row.key, $event)"
                        />
                      </div>
                    }
                  </div>
                </p-tabpanel>

              </p-tabpanels>
            </p-tabs>
          </p-card>

          <!--  Danger zone  -->
          <div class="mt-6 border border-red-200 rounded-xl p-5 bg-red-50">
            <div class="flex items-start gap-3">
              <i class="pi pi-exclamation-circle text-red-500 text-xl shrink-0 mt-0.5"></i>
              <div class="flex-1 min-w-0">
                <h3 class="font-semibold text-red-700 text-base m-0">Danger Zone</h3>
                <p class="text-sm text-red-600 mt-1 mb-3">
                  Once you delete your account, all your data will be permanently removed. This cannot be undone.
                </p>
                <p-button
                  label="Delete My Account"
                  icon="pi pi-trash"
                  severity="danger"
                  [outlined]="true"
                  size="small"
                  (onClick)="openDeleteDialog()"
                />
              </div>
            </div>
          </div>

        } <!-- end @else -->
      </div>
    </div>
  `,
})
export class AccountComponent implements OnInit {
  private readonly userService    = inject(UserService);
  private readonly authService    = inject(AuthService);
  private readonly bookingService = inject(BookingService);
  private readonly router         = inject(Router);
  private readonly confirmSvc     = inject(ConfirmationService);
  private readonly msgSvc         = inject(MessageService);
  private readonly fb             = inject(FormBuilder);
  private readonly cdr            = inject(ChangeDetectorRef);

  //  State 
  readonly loading             = signal(true);
  readonly profile             = signal<UserProfile | null>(null);
  readonly avatarPreview       = signal<string | null>(null);
  readonly avatarFile          = signal<File | null>(null);
  readonly notifPrefs          = signal<NotificationPreferences>({
    email:    true,
    sms:      false,
    whatsapp: false,
    push:     false,
  });
  readonly connectedAccounts   = signal<ConnectedAccounts>({});
  readonly bookings            = signal<Booking[]>([]);
  readonly bookingsLoading     = signal(true);

  readonly savingProfile       = signal(false);
  readonly savingAvatar        = signal(false);
  readonly savingPassword      = signal(false);
  readonly disconnectingGoogle = signal(false);
  readonly deletingAccount     = signal(false);

  deleteDialogVisible = false;
  deleteConfirmText   = '';

  readonly initials = computed(() => {
    const p = this.profile();
    if (!p) return '?';
    return `${p.firstName.charAt(0)}${p.lastName.charAt(0)}`.toUpperCase();
  });

  readonly recentBookings = computed(() =>
    [...this.bookings()].sort(
      (a, b) => new Date(b.appointmentDate).getTime() - new Date(a.appointmentDate).getTime()
    ).slice(0, 5)
  );

  //  Options 
  readonly languageOptions = [
    { label: 'English', value: 'en' },
    { label: 'Sinhala', value: 'si' },
    { label: 'Tamil',   value: 'ta' },
  ];

  readonly contactOptions = [
    { label: 'Email',    value: 'email' },
    { label: 'SMS',      value: 'sms' },
    { label: 'WhatsApp', value: 'whatsapp' },
  ];

  readonly notifRows: Array<{
    key: keyof NotificationPreferences;
    label: string;
    desc: string;
    icon: string;
  }> = [
    {
      key:   'email',
      label: 'Email Notifications',
      desc:  'Booking confirmations and reminders via email',
      icon:  'pi pi-envelope',
    },
    {
      key:   'sms',
      label: 'SMS Reminders',
      desc:  'SMS reminder 2 hours before your appointment',
      icon:  'pi pi-mobile',
    },
    {
      key:   'whatsapp',
      label: 'WhatsApp Messages',
      desc:  'Appointment updates via WhatsApp',
      icon:  'pi pi-comment',
    },
    {
      key:   'push',
      label: 'Push Notifications',
      desc:  'In-app and browser push notifications',
      icon:  'pi pi-bell',
    },
  ];

  //  Forms 
  readonly profileForm = this.fb.group({
    firstName:         ['', [Validators.required, Validators.maxLength(50)]],
    lastName:          ['', [Validators.required, Validators.maxLength(50)]],
    phone:             ['', [Validators.pattern(SL_PHONE)]],
    email:             [{ value: '', disabled: true }],
    preferredLanguage: ['en'],
    preferredContact:  ['email'],
  });

  readonly passwordForm = this.fb.group(
    {
      currentPassword: ['', [Validators.required]],
      newPassword:     ['', [Validators.required, Validators.minLength(8), passwordComplexity]],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: confirmPasswordMatch },
  );

  //  Lifecycle 
  ngOnInit(): void {
    this.loadProfile();
    this.loadConnectedAccounts();
    this.loadBookings();
  }

  protected loadProfile(): void {
    this.loading.set(true);
    this.userService.getProfile().subscribe({
      next: (p) => {
        this.profile.set(p);
        this.profileForm.patchValue({
          firstName: p.firstName,
          lastName:  p.lastName,
          phone:     p.phone ?? '',
          email:     p.email,
        });
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.toast('error', 'Failed to load profile');
      },
    });
  }

  private loadConnectedAccounts(): void {
    this.userService.getConnectedAccounts().subscribe({
      next: (ca) => this.connectedAccounts.set(ca),
      error: () => { /* non-critical */ },
    });
  }

  private loadBookings(): void {
    this.bookingsLoading.set(true);
    this.bookingService.getMyBookings().subscribe({
      next: (list) => { this.bookings.set(list); this.bookingsLoading.set(false); },
      error: () => this.bookingsLoading.set(false),
    });
  }

  //  Avatar 
  onAvatarFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file  = input.files?.[0];
    if (!file) return;
    this.avatarFile.set(file);
    const reader = new FileReader();
    reader.onload = () => { this.avatarPreview.set(reader.result as string); this.cdr.markForCheck(); };
    reader.readAsDataURL(file);
  }

  uploadAvatar(): void {
    const file = this.avatarFile();
    if (!file) return;
    const fd = new FormData();
    fd.append('avatar', file);
    this.savingAvatar.set(true);
    this.userService.updateAvatar(fd).subscribe({
      next: (res) => {
        this.profile.update((p) => p ? { ...p, avatarUrl: res.avatarUrl } : p);
        this.avatarFile.set(null);
        this.savingAvatar.set(false);
        this.toast('success', 'Photo updated');
      },
      error: () => { this.savingAvatar.set(false); this.toast('error', 'Failed to upload photo'); },
    });
  }

  //  Profile save 
  saveProfile(): void {
    this.profileForm.markAllAsTouched();
    if (this.profileForm.invalid) return;
    const { firstName, lastName, phone } = this.profileForm.getRawValue();
    this.savingProfile.set(true);
    this.userService.updateProfile({
      firstName: firstName ?? '',
      lastName:  lastName  ?? '',
      phone:     phone     || undefined,
    }).subscribe({
      next: (updated) => {
        this.profile.set(updated);
        this.savingProfile.set(false);
        this.toast('success', 'Profile updated successfully');
      },
      error: () => { this.savingProfile.set(false); this.toast('error', 'Failed to save profile'); },
    });
  }

  //  Password change 
  changePassword(): void {
    this.passwordForm.markAllAsTouched();
    if (this.passwordForm.invalid) return;
    const { currentPassword, newPassword } = this.passwordForm.getRawValue();
    this.savingPassword.set(true);
    this.userService.changePassword({
      currentPassword: currentPassword ?? '',
      newPassword:     newPassword     ?? '',
    }).subscribe({
      next: () => {
        this.passwordForm.reset();
        this.savingPassword.set(false);
        this.toast('success', 'Password changed successfully');
      },
      error: (err) => {
        this.savingPassword.set(false);
        this.toast('error', (err?.error?.message as string) || 'Failed to change password');
      },
    });
  }

  //  Connected accounts 
  connectGoogle(): void { window.location.href = '/api/auth/google'; }

  disconnectGoogle(): void {
    this.disconnectingGoogle.set(true);
    this.userService.disconnectGoogle().subscribe({
      next: () => {
        this.connectedAccounts.update((ca) => ({ ...ca, google: undefined }));
        this.disconnectingGoogle.set(false);
        this.toast('success', 'Google account disconnected');
      },
      error: () => { this.disconnectingGoogle.set(false); this.toast('error', 'Failed to disconnect Google'); },
    });
  }

  //  Notification toggle 
  onNotifToggle(key: keyof NotificationPreferences, value: boolean): void {
    this.notifPrefs.update((p) => ({ ...p, [key]: value }));
    this.userService.updateNotificationPreferences({ [key]: value }).subscribe({
      error: () => {
        this.notifPrefs.update((p) => ({ ...p, [key]: !value }));
        this.toast('error', 'Failed to save preference');
      },
    });
  }

  //  Delete account 
  openDeleteDialog(): void {
    this.deleteConfirmText = '';
    this.deleteDialogVisible = true;
  }

  doDeleteAccount(): void {
    if (this.deleteConfirmText !== 'DELETE') return;
    this.deletingAccount.set(true);
    this.userService.deleteAccount().subscribe({
      next: () => {
        this.authService.logout().subscribe({
          next:  () => void this.router.navigate(['/']),
          error: () => void this.router.navigate(['/']),
        });
      },
      error: () => {
        this.deletingAccount.set(false);
        this.toast('error', 'Failed to delete account');
      },
    });
  }

  //  Status helper 
  statusSeverity(s: BookingStatus): StatusSeverity {
    return STATUS_SEVERITY[s] ?? 'secondary';
  }

  //  Error helpers 
  profileError(field: string): string | null {
    const ctrl = this.profileForm.get(field);
    if (!ctrl?.touched || ctrl.valid) return null;
    if (ctrl.hasError('required'))   return `${this.fieldLabel(field)} is required`;
    if (ctrl.hasError('maxlength'))  return 'Max 50 characters';
    if (ctrl.hasError('pattern'))    return 'Use Sri Lanka format: +94XXXXXXXXX';
    return null;
  }

  passwordError(field: string): string | null {
    const ctrl = this.passwordForm.get(field);
    if (!ctrl?.touched) return null;
    if (ctrl.hasError('required'))    return 'This field is required';
    if (ctrl.hasError('minlength'))   return 'At least 8 characters';
    if (ctrl.hasError('complexity'))  return 'Must include uppercase, lowercase, number & special character';
    if (field === 'confirmPassword' && this.passwordForm.hasError('mismatch'))
      return 'Passwords do not match';
    return null;
  }

  private fieldLabel(f: string): string {
    return ({ firstName: 'First name', lastName: 'Last name', phone: 'Phone' } as Record<string, string>)[f] ?? f;
  }

  private toast(severity: 'success' | 'error' | 'info' | 'warn', detail: string): void {
    this.msgSvc.add({ severity, summary: severity === 'error' ? 'Error' : 'Done', detail, life: 3500 });
  }
}
