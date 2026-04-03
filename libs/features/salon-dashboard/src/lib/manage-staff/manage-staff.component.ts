import {
  ChangeDetectionStrategy,
  Component,
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

import { ButtonModule } from 'primeng/button';
import { AvatarModule } from 'primeng/avatar';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ToastModule } from 'primeng/toast';
import { DividerModule } from 'primeng/divider';
import { ToolbarModule } from 'primeng/toolbar';
import { ChipModule } from 'primeng/chip';
import { FloatLabelModule } from 'primeng/floatlabel';
import { FluidModule } from 'primeng/fluid';
import { TooltipModule } from 'primeng/tooltip';
import { TagModule } from 'primeng/tag';
import { TableModule } from 'primeng/table';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { ConfirmationService, MessageService } from 'primeng/api';

import {
  SalonAdminService,
  SalonStaffMember,
  StylistSearchResult,
  JoinRequestDto,
  SentInvitationDto,
} from '@org/shared-data-access';

export interface StaffMember {
  id: string;
  name: string;
  role: string;
  email?: string;
  phone?: string;
  specialties: string[];
  photo?: string;
  rating: number;
  yearsExperience: number;
  bio?: string;
}

@Component({
  selector: 'lib-manage-staff',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ConfirmationService, MessageService],
  imports: [
    ReactiveFormsModule,
    FormsModule,
    ButtonModule,
    AvatarModule,
    DialogModule,
    InputTextModule,
    InputNumberModule,
    SelectModule,
    ConfirmDialogModule,
    ToastModule,
    DividerModule,
    ToolbarModule,
    ChipModule,
    FloatLabelModule,
    FluidModule,
    TooltipModule,
    TagModule,
    TableModule,
    ProgressSpinnerModule,
  ],
  templateUrl: './manage-staff.component.html',
})
export class ManageStaffComponent implements OnInit {
  private readonly confirmSvc  = inject(ConfirmationService);
  private readonly msgSvc      = inject(MessageService);
  private readonly fb          = inject(FormBuilder);
  private readonly adminService = inject(SalonAdminService);

  readonly staff             = signal<StaffMember[]>([]);
  readonly joinRequests      = signal<JoinRequestDto[]>([]);
  readonly sentInvitations   = signal<SentInvitationDto[]>([]);
  readonly isLoading         = signal(true);
  readonly isSaving          = signal(false);
  readonly isSearching       = signal(false);

  /** Per-type break limit management */
  readonly breakLimits        = signal({ LUNCH: 1, COFFEE: 1, PERSONAL: 1, OTHER: 1 });
  readonly isSavingBreakLimits = signal(false);
  breakLimitsInput            = { LUNCH: 1, COFFEE: 1, PERSONAL: 1, OTHER: 1 };

  readonly breakTypeRows: Array<{ key: 'LUNCH'|'COFFEE'|'PERSONAL'|'OTHER'; label: string; icon: string; color: string }> = [
    { key: 'LUNCH',    label: 'Lunch Break',    icon: 'pi pi-sun',    color: 'text-amber-600' },
    { key: 'COFFEE',   label: 'Coffee Break',   icon: 'pi pi-bolt',  color: 'text-yellow-700' },
    { key: 'PERSONAL', label: 'Personal Break', icon: 'pi pi-user',  color: 'text-violet-600' },
    { key: 'OTHER',    label: 'Other Break',    icon: 'pi pi-clock', color: 'text-zinc-500' },
  ];

  limitsChanged(): boolean {
    const cur = this.breakLimits();
    const inp = this.breakLimitsInput;
    return (
      inp.LUNCH    !== cur.LUNCH    ||
      inp.COFFEE   !== cur.COFFEE   ||
      inp.PERSONAL !== cur.PERSONAL ||
      inp.OTHER    !== cur.OTHER
    );
  }

  /** Search-by-email result */
  readonly searchResult  = signal<StylistSearchResult | null>(null);
  readonly searchError   = signal<string | null>(null);

  private salonId = '';
  private salonName = '';

  addDialogVisible = false;

  readonly searchForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });

  ngOnInit(): void {
    this.adminService.getDashboardSalon().subscribe({
      next: (salon) => {
        this.salonId = salon._id;
        this.salonName = salon.name;
        const limits = salon.breakLimits ?? { LUNCH: 1, COFFEE: 1, PERSONAL: 1, OTHER: 1 };
        const normalised = {
          LUNCH:    limits.LUNCH    ?? 1,
          COFFEE:   limits.COFFEE   ?? 1,
          PERSONAL: limits.PERSONAL ?? 1,
          OTHER:    limits.OTHER    ?? 1,
        };
        this.breakLimits.set(normalised);
        this.breakLimitsInput = { ...normalised };
        this.loadStaff();
        this.loadJoinRequests();
        this.loadSentInvitations();
      },
      error: () => {
        this.isLoading.set(false);
        this.msgSvc.add({ severity: 'error', summary: 'Error', detail: 'Failed to load salon info.' });
      },
    });
  }

  getInitials(name: string): string {
    return name
      .split(' ')
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase();
  }

  // ── Load data ────────────────────────────────────────────────────────────

  private loadStaff(): void {
    this.isLoading.set(true);
    this.adminService.getSalonStaff(this.salonId).subscribe({
      next: (staffList) => {
        this.staff.set(staffList.map((s) => this.mapStaffMember(s)));
        this.isLoading.set(false);
      },
      error: () => {
        this.isLoading.set(false);
        this.msgSvc.add({ severity: 'error', summary: 'Error', detail: 'Failed to load staff.' });
      },
    });
  }

  private loadJoinRequests(): void {
    this.adminService.getJoinRequests(this.salonId).subscribe({
      next: (requests) => this.joinRequests.set(requests),
      error: () => {
        /* silently ignore — join requests are optional */
      },
    });
  }

  private loadSentInvitations(): void {
    this.adminService.getSentInvitations(this.salonId).subscribe({
      next: (invitations) => this.sentInvitations.set(invitations),
      error: () => { /* silently ignore */ },
    });
  }

  invitationSeverity(status: string): 'warn' | 'success' | 'danger' | 'info' {
    switch (status) {
      case 'pending':  return 'warn';
      case 'accepted': return 'success';
      case 'rejected': return 'danger';
      default:         return 'info';
    }
  }

  invitationLabel(status: string): string {
    switch (status) {
      case 'pending':  return 'Sent';
      case 'accepted': return 'Accepted';
      case 'rejected': return 'Declined';
      default:         return status;
    }
  }

  private mapStaffMember(s: SalonStaffMember): StaffMember {
    return {
      id: s._id,
      name: `${s.firstName} ${s.lastName}`,
      role: 'Stylist',
      email: s.email,
      specialties: s.stylistProfile?.specialties ?? [],
      photo: s.avatarUrl,
      rating: s.stylistProfile?.averageRating ?? 0,
      yearsExperience: s.stylistProfile?.yearsExperience ?? 0,
      bio: s.stylistProfile?.bio,
    };
  }

  // ── Search by email ──────────────────────────────────────────────────────

  openAddDialog(): void {
    this.addDialogVisible = true;
    this.searchResult.set(null);
    this.searchError.set(null);
    this.searchForm.reset();
  }

  searchByEmail(): void {
    this.searchForm.markAllAsTouched();
    if (this.searchForm.invalid) return;

    const email = this.searchForm.getRawValue().email.trim().toLowerCase();
    this.isSearching.set(true);
    this.searchResult.set(null);
    this.searchError.set(null);

    this.adminService.searchUserByEmail(email).subscribe({
      next: (result) => {
        this.isSearching.set(false);
        if (!result) {
          this.searchError.set('No user found with this email address.');
          return;
        }
        if (result.role?.toUpperCase() !== 'STYLIST') {
          this.searchError.set(`This user is registered as "${result.role}", not as a Stylist.`);
          return;
        }
        // Check if already a staff member
        const existingIds = this.staff().map((s) => s.id);
        if (existingIds.includes(result.userId) || existingIds.includes(result._id)) {
          this.searchError.set('This stylist is already a member of your staff.');
          return;
        }
        this.searchResult.set(result);
      },
      error: () => {
        this.isSearching.set(false);
        this.searchError.set('Failed to search. Please try again.');
      },
    });
  }

  addSearchedStylist(): void {
    const result = this.searchResult();
    if (!result || !this.salonId) return;

    this.isSaving.set(true);
    // Use userId if available (that's the auth-service ID), otherwise _id
    const stylistId = result.userId || result._id;

    this.adminService.inviteStylist(stylistId, this.salonId, this.salonName).subscribe({
      next: () => {
        this.isSaving.set(false);
        this.addDialogVisible = false;
        this.searchResult.set(null);
        this.msgSvc.add({
          severity: 'success',
          summary: 'Invitation Sent',
          detail: `An invitation has been sent to ${result.firstName} ${result.lastName}. They will appear in your staff once they accept.`,
        });
        this.loadSentInvitations();
      },
      error: (err) => {
        this.isSaving.set(false);
        const msg = err?.error?.message || 'Failed to send invitation.';
        this.msgSvc.add({ severity: 'error', summary: 'Error', detail: msg });
      },
    });
  }

  // ── Join request management ──────────────────────────────────────────────

  approveRequest(request: JoinRequestDto): void {
    this.adminService.approveJoinRequest(request._id).subscribe({
      next: () => {
        this.msgSvc.add({
          severity: 'success',
          summary: 'Approved',
          detail: `${request.firstName} ${request.lastName} approved.`,
        });
        this.loadJoinRequests();
        this.loadStaff();
      },
      error: () => {
        this.msgSvc.add({ severity: 'error', summary: 'Error', detail: 'Failed to approve request.' });
      },
    });
  }

  rejectRequest(request: JoinRequestDto): void {
    this.confirmSvc.confirm({
      message: `Reject ${request.firstName} ${request.lastName}'s join request?`,
      header: 'Reject Request',
      icon: 'pi pi-exclamation-triangle',
      acceptButtonProps: { severity: 'danger', label: 'Reject' },
      rejectButtonProps: { severity: 'secondary', label: 'Cancel', text: true },
      accept: () => {
        this.adminService.rejectJoinRequest(request._id).subscribe({
          next: () => {
            this.msgSvc.add({
              severity: 'info',
              summary: 'Rejected',
              detail: `${request.firstName} ${request.lastName}'s request rejected.`,
            });
            this.loadJoinRequests();
          },
          error: () => {
            this.msgSvc.add({ severity: 'error', summary: 'Error', detail: 'Failed to reject request.' });
          },
        });
      },
    });
  }

  // ── Remove staff ─────────────────────────────────────────────────────────

  confirmRemove(member: StaffMember): void {
    this.confirmSvc.confirm({
      message: `Remove <b>${member.name}</b> from the team?`,
      header: 'Remove Staff Member',
      icon: 'pi pi-exclamation-triangle',
      acceptButtonProps: { severity: 'danger', label: 'Remove', icon: 'pi pi-trash' },
      rejectButtonProps: { severity: 'secondary', label: 'Cancel', text: true },
      accept: () => {
        this.adminService.removeStaff(this.salonId, member.id).subscribe({
          next: () => {
            this.staff.update((list) => list.filter((m) => m.id !== member.id));
            this.msgSvc.add({
              severity: 'info',
              summary: 'Removed',
              detail: `${member.name} removed from staff.`,
            });
          },
          error: () => {
            this.msgSvc.add({ severity: 'error', summary: 'Error', detail: 'Failed to remove staff member.' });
          },
        });
      },
    });
  }

  // ── Break limit management ──────────────────────────────────────

  saveBreakLimits(): void {
    const inp = this.breakLimitsInput;
    for (const key of ['LUNCH', 'COFFEE', 'PERSONAL', 'OTHER'] as const) {
      if (!Number.isInteger(inp[key]) || inp[key] < 0) {
        this.msgSvc.add({ severity: 'warn', summary: 'Invalid', detail: `${key} limit must be a non-negative whole number.` });
        return;
      }
    }
    this.isSavingBreakLimits.set(true);
    this.adminService.updateSalon(this.salonId, { breakLimits: { ...inp } }).subscribe({
      next: () => {
        this.breakLimits.set({ ...inp });
        this.isSavingBreakLimits.set(false);
        this.msgSvc.add({
          severity: 'success',
          summary: 'Saved',
          detail: 'Break limits updated successfully.',
        });
      },
      error: () => {
        this.isSavingBreakLimits.set(false);
        this.msgSvc.add({ severity: 'error', summary: 'Error', detail: 'Failed to update break limits.' });
      },
    });
  }
}
