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
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';

import { AuthService } from '@org/shared-data-access';
import {
  ConnectedAccounts,
  NotificationPreferences,
  UserProfile,
  UserService,
} from '@org/shared-data-access';

import { DeleteAccountDialogComponent } from '../delete-account-dialog/delete-account-dialog.component';

// ── Validators ────────────────────────────────────────────────────────────────

/** At least 8 chars, 1 uppercase, 1 lowercase, 1 digit, 1 special */
const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_\-+=[\]{}|;':",.<>?/`~])/;

const passwordComplexity: ValidatorFn = (ctrl: AbstractControl): ValidationErrors | null =>
  ctrl.value && !PASSWORD_PATTERN.test(ctrl.value as string)
    ? { complexity: true }
    : null;

function confirmPasswordMatch(group: AbstractControl): ValidationErrors | null {
  const pw  = group.get('newPassword')?.value as string;
  const cpw = group.get('confirmPassword')?.value as string;
  return pw && cpw && pw !== cpw ? { mismatch: true } : null;
}

// ── Sri Lanka phone pattern: optional +94 prefix, then 9 digits ───────────────
const SL_PHONE = /^(\+94)?[0-9]{9,10}$/;

// ─────────────────────────────────────────────────────────────────────────────

@Component({
  selector: 'lib-account',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDividerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSlideToggleModule,
    MatTabsModule,
    MatTooltipModule,
  ],
  templateUrl: './account.component.html',
  styleUrl:    './account.component.scss',
})
export class AccountComponent implements OnInit {
  // ── DI ────────────────────────────────────────────────────────────────────
  private readonly userService  = inject(UserService);
  private readonly authService  = inject(AuthService);
  private readonly router       = inject(Router);
  private readonly dialog       = inject(MatDialog);
  private readonly snack        = inject(MatSnackBar);
  private readonly fb           = inject(FormBuilder);
  private readonly cdr          = inject(ChangeDetectorRef);

  // ── State ─────────────────────────────────────────────────────────────────
  readonly loading            = signal(true);
  readonly profile            = signal<UserProfile | null>(null);
  readonly avatarPreview      = signal<string | null>(null);
  readonly avatarFile         = signal<File | null>(null);
  readonly notifPrefs         = signal<NotificationPreferences>({
    emailBookingConfirmations: true,
    emailReminders:            true,
    smsReminders:              false,
    whatsappMessages:          false,
  });
  readonly connectedAccounts  = signal<ConnectedAccounts>({});

  readonly savingProfile      = signal(false);
  readonly savingAvatar       = signal(false);
  readonly savingPassword     = signal(false);
  readonly disconnectingGoogle = signal(false);
  readonly deletingAccount    = signal(false);

  readonly currentUser = computed(() => this.authService.currentUser());

  /** Initials fallback for avatar circle */
  readonly initials = computed(() => {
    const p = this.profile();
    if (!p) return '?';
    return `${p.firstName.charAt(0)}${p.lastName.charAt(0)}`.toUpperCase();
  });

  // ── Forms ─────────────────────────────────────────────────────────────────
  readonly profileForm = this.fb.group({
    firstName: ['', [Validators.required, Validators.maxLength(50)]],
    lastName:  ['', [Validators.required, Validators.maxLength(50)]],
    phone:     ['', [Validators.pattern(SL_PHONE)]],
    email:     [{ value: '', disabled: true }],
  });

  readonly passwordForm = this.fb.group(
    {
      currentPassword:  ['', [Validators.required]],
      newPassword:      ['', [Validators.required, Validators.minLength(8), passwordComplexity]],
      confirmPassword:  ['', [Validators.required]],
    },
    { validators: confirmPasswordMatch },
  );

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  ngOnInit(): void {
    this.loadProfile();
    this.loadConnectedAccounts();
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
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
        this.snack.open('Failed to load profile', 'Dismiss', { duration: 4000 });
      },
    });
  }

  private loadConnectedAccounts(): void {
    this.userService.getConnectedAccounts().subscribe({
      next: (ca) => this.connectedAccounts.set(ca),
      error: () => { /* non-critical */ },
    });
  }

  // ── Avatar ─────────────────────────────────────────────────────────────────
  onAvatarFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file  = input.files?.[0];
    if (!file) return;
    this.avatarFile.set(file);

    const reader = new FileReader();
    reader.onload = () => {
      this.avatarPreview.set(reader.result as string);
      this.cdr.markForCheck();
    };
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
        this.snack.open('Photo updated', undefined, { duration: 3000 });
      },
      error: () => {
        this.savingAvatar.set(false);
        this.snack.open('Failed to upload photo', 'Dismiss', { duration: 4000 });
      },
    });
  }

  // ── Profile save ───────────────────────────────────────────────────────────
  saveProfile(): void {
    if (this.profileForm.invalid) {
      this.profileForm.markAllAsTouched();
      return;
    }

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
        this.snack.open('Profile updated successfully', undefined, { duration: 3000 });
      },
      error: () => {
        this.savingProfile.set(false);
        this.snack.open('Failed to save profile', 'Dismiss', { duration: 4000 });
      },
    });
  }

  // ── Password change ────────────────────────────────────────────────────────
  changePassword(): void {
    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      return;
    }

    const { currentPassword, newPassword } = this.passwordForm.getRawValue();
    this.savingPassword.set(true);

    this.userService.changePassword({
      currentPassword: currentPassword ?? '',
      newPassword:     newPassword     ?? '',
    }).subscribe({
      next: () => {
        this.passwordForm.reset();
        this.savingPassword.set(false);
        this.snack.open('Password changed successfully', undefined, { duration: 3000 });
      },
      error: (err) => {
        this.savingPassword.set(false);
        const msg = (err?.error?.message as string) || 'Failed to change password';
        this.snack.open(msg, 'Dismiss', { duration: 5000 });
      },
    });
  }

  // ── Connected accounts ─────────────────────────────────────────────────────
  connectGoogle(): void {
    window.location.href = '/api/auth/google';
  }

  disconnectGoogle(): void {
    this.disconnectingGoogle.set(true);
    this.userService.disconnectGoogle().subscribe({
      next: () => {
        this.connectedAccounts.update((ca) => ({ ...ca, google: undefined }));
        this.disconnectingGoogle.set(false);
        this.snack.open('Google account disconnected', undefined, { duration: 3000 });
      },
      error: () => {
        this.disconnectingGoogle.set(false);
        this.snack.open('Failed to disconnect Google account', 'Dismiss', { duration: 4000 });
      },
    });
  }

  // ── Notification toggle ────────────────────────────────────────────────────
  onNotifToggle(key: keyof NotificationPreferences, value: boolean): void {
    this.notifPrefs.update((p) => ({ ...p, [key]: value }));
    this.userService.updateNotificationPreferences({ [key]: value }).subscribe({
      error: () => {
        // Revert optimistic update
        this.notifPrefs.update((p) => ({ ...p, [key]: !value }));
        this.snack.open('Failed to save preference', 'Dismiss', { duration: 4000 });
      },
    });
  }

  // ── Delete account ─────────────────────────────────────────────────────────
  openDeleteDialog(): void {
    const ref = this.dialog.open(DeleteAccountDialogComponent, {
      width: '440px',
      disableClose: true,
    });

    ref.afterClosed().subscribe((confirmed: boolean) => {
      if (!confirmed) return;

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
          this.snack.open('Failed to delete account', 'Dismiss', { duration: 5000 });
        },
      });
    });
  }

  // ── Error helpers (template-facing) ───────────────────────────────────────
  profileError(field: string): string | null {
    const ctrl = this.profileForm.get(field);
    if (!ctrl?.touched || ctrl.valid) return null;
    if (ctrl.hasError('required'))   return `${this.fieldLabel(field)} is required`;
    if (ctrl.hasError('maxlength'))  return `Max 50 characters`;
    if (ctrl.hasError('pattern'))    return 'Use Sri Lanka format: +94XXXXXXXXX';
    return null;
  }

  passwordError(field: string): string | null {
    const ctrl = this.passwordForm.get(field);
    if (!ctrl?.touched) return null;
    if (ctrl.hasError('required'))   return 'This field is required';
    if (ctrl.hasError('minlength'))  return 'At least 8 characters';
    if (ctrl.hasError('complexity'))
      return 'Must include uppercase, lowercase, number & special character';
    if (field === 'confirmPassword' && this.passwordForm.hasError('mismatch'))
      return 'Passwords do not match';
    return null;
  }

  private fieldLabel(f: string): string {
    const map: Record<string, string> = {
      firstName: 'First name', lastName: 'Last name', phone: 'Phone',
    };
    return map[f] ?? f;
  }
}
