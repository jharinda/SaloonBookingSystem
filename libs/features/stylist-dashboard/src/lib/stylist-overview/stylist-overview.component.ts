import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { CardModule } from 'primeng/card';
import { ProgressSpinner } from 'primeng/progressspinner';
import { TagModule } from 'primeng/tag';

import { UserService, UserProfile, SalonInvitationDto } from '@org/shared-data-access';

@Component({
  selector: 'lib-stylist-overview',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, CardModule, ProgressSpinner, TagModule],
  template: `
    <div class="space-y-6">
      <h2 class="text-2xl font-bold text-zinc-800 dark:text-zinc-100">Overview</h2>

      @if (loading()) {
        <div class="flex items-center justify-center py-16">
          <p-progressSpinner strokeWidth="3" animationDuration=".8s" [style]="{ width: '36px', height: '36px' }" />
        </div>
      } @else {
        <!-- Stats cards -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <!-- Salons -->
          <p-card styleClass="shadow-sm border border-zinc-200 dark:border-zinc-700">
            <div class="flex items-center gap-4">
              <div class="w-12 h-12 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                <i class="pi pi-building text-violet-600 dark:text-violet-400 text-xl"></i>
              </div>
              <div>
                <p class="text-sm text-zinc-500 dark:text-zinc-400">Active Salons</p>
                <p class="text-2xl font-bold text-zinc-800 dark:text-zinc-100">{{ activeSalons() }}</p>
              </div>
            </div>
          </p-card>

          <!-- Pending invitations -->
          <p-card styleClass="shadow-sm border border-zinc-200 dark:border-zinc-700">
            <div class="flex items-center gap-4">
              <div class="w-12 h-12 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <i class="pi pi-envelope text-amber-600 dark:text-amber-400 text-xl"></i>
              </div>
              <div>
                <p class="text-sm text-zinc-500 dark:text-zinc-400">Pending Invitations</p>
                <p class="text-2xl font-bold text-zinc-800 dark:text-zinc-100">{{ pendingInvitations() }}</p>
              </div>
            </div>
          </p-card>

          <!-- Experience -->
          <p-card styleClass="shadow-sm border border-zinc-200 dark:border-zinc-700">
            <div class="flex items-center gap-4">
              <div class="w-12 h-12 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <i class="pi pi-star text-emerald-600 dark:text-emerald-400 text-xl"></i>
              </div>
              <div>
                <p class="text-sm text-zinc-500 dark:text-zinc-400">Specialties</p>
                <p class="text-2xl font-bold text-zinc-800 dark:text-zinc-100">{{ specialtiesCount() }}</p>
              </div>
            </div>
          </p-card>
        </div>

        <!-- Active salons list -->
        @if (acceptedInvitations().length) {
          <p-card header="My Salons" styleClass="shadow-sm border border-zinc-200 dark:border-zinc-700">
            <div class="space-y-3">
              @for (inv of acceptedInvitations(); track inv.salonId) {
                <div class="flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-900 rounded-lg">
                  <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center text-sm font-bold text-violet-600 dark:text-violet-400">
                      {{ inv.salonName.charAt(0).toUpperCase() }}
                    </div>
                    <div>
                      <p class="text-sm font-medium text-zinc-800 dark:text-zinc-100">{{ inv.salonName }}</p>
                      <p class="text-xs text-zinc-500">Joined {{ inv.respondedAt ? (inv.respondedAt | date:'mediumDate') : (inv.invitedAt | date:'mediumDate') }}</p>
                    </div>
                  </div>
                  <p-tag value="Active" severity="success" />
                </div>
              }
            </div>
          </p-card>
        }

        <!-- Profile summary -->
        @if (profile()) {
          <p-card header="Profile Summary" styleClass="shadow-sm border border-zinc-200 dark:border-zinc-700">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <span class="text-zinc-500 dark:text-zinc-400">Name:</span>
                <span class="ml-2 font-medium text-zinc-800 dark:text-zinc-100">{{ profile()!.firstName }} {{ profile()!.lastName }}</span>
              </div>
              <div>
                <span class="text-zinc-500 dark:text-zinc-400">Email:</span>
                <span class="ml-2 font-medium text-zinc-800 dark:text-zinc-100">{{ profile()!.email }}</span>
              </div>
              <div>
                <span class="text-zinc-500 dark:text-zinc-400">Member since:</span>
                <span class="ml-2 font-medium text-zinc-800 dark:text-zinc-100">{{ profile()!.createdAt | date:'mediumDate' }}</span>
              </div>
              <div>
                <span class="text-zinc-500 dark:text-zinc-400">Role:</span>
                <span class="ml-2">
                  <p-tag value="Stylist" severity="info" />
                </span>
              </div>
            </div>
          </p-card>
        }
      }
    </div>
  `,
})
export class StylistOverviewComponent implements OnInit {
  private readonly userService = inject(UserService);

  readonly loading  = signal(true);
  readonly profile  = signal<UserProfile | null>(null);
  readonly invitations = signal<SalonInvitationDto[]>([]);

  readonly activeSalons = signal(0);
  readonly pendingInvitations = signal(0);
  readonly specialtiesCount = signal(0);

  readonly acceptedInvitations = signal<SalonInvitationDto[]>([]);

  ngOnInit(): void {
    this.loadData();
  }

  private loadData(): void {
    this.loading.set(true);

    // Load profile
    this.userService.getProfile().subscribe({
      next: (p) => {
        this.profile.set(p);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });

    // Load invitations
    this.userService.getStylistInvitations().subscribe({
      next: (invs) => {
        this.invitations.set(invs);
        const accepted = invs.filter((i) => i.status === 'accepted');
        const pending  = invs.filter((i) => i.status === 'pending');
        this.acceptedInvitations.set(accepted);
        this.activeSalons.set(accepted.length);
        this.pendingInvitations.set(pending.length);
      },
      error: () => { /* ignore */ },
    });
  }
}
