import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { CardModule } from 'primeng/card';
import { Button } from 'primeng/button';
import { ProgressSpinner } from 'primeng/progressspinner';
import { TagModule } from 'primeng/tag';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';

import { UserService, SalonInvitationDto } from '@org/shared-data-access';

type InvitationSeverity = 'warn' | 'success' | 'danger' | 'info';

@Component({
  selector: 'lib-stylist-invitations',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [MessageService],
  imports: [DatePipe, CardModule, Button, ProgressSpinner, TagModule, ToastModule],
  template: `
    <p-toast />

    <div class="space-y-6">
      <h2 class="text-2xl font-bold text-zinc-800 dark:text-zinc-100">Salon Invitations</h2>

      @if (loading()) {
        <div class="flex items-center justify-center py-16">
          <p-progressSpinner strokeWidth="3" animationDuration=".8s" [style]="{ width: '36px', height: '36px' }" />
        </div>
      } @else if (!invitations().length) {
        <p-card styleClass="shadow-sm border border-zinc-200 dark:border-zinc-700">
          <div class="flex flex-col items-center justify-center py-12 text-zinc-500">
            <i class="pi pi-envelope text-4xl mb-3 text-zinc-300"></i>
            <p class="text-lg font-medium">No invitations yet</p>
            <p class="text-sm">When a salon owner invites you, it will appear here.</p>
          </div>
        </p-card>
      } @else {

        <!-- Pending invitations -->
        @if (pendingInvitations().length) {
          <div class="space-y-3">
            <h3 class="text-lg font-semibold text-zinc-700 dark:text-zinc-300">
              Pending
              <span class="ml-2 inline-flex items-center justify-center w-6 h-6 text-xs font-bold text-white bg-amber-500 rounded-full">
                {{ pendingInvitations().length }}
              </span>
            </h3>
            @for (inv of pendingInvitations(); track inv.salonId) {
              <p-card styleClass="shadow-sm border border-amber-200 dark:border-amber-800/50">
                <div class="flex items-center justify-between flex-wrap gap-4">
                  <div class="flex items-center gap-3">
                    <div class="w-12 h-12 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center text-lg font-bold text-violet-600 dark:text-violet-400">
                      {{ inv.salonName.charAt(0).toUpperCase() }}
                    </div>
                    <div>
                      <p class="text-base font-medium text-zinc-800 dark:text-zinc-100">{{ inv.salonName }}</p>
                      <p class="text-xs text-zinc-500">Invited {{ inv.invitedAt | date:'medium' }}</p>
                    </div>
                  </div>
                  <div class="flex items-center gap-2">
                    <p-button
                      label="Accept"
                      icon="pi pi-check"
                      severity="success"
                      size="small"
                      [loading]="processingId() === inv.salonId"
                      (onClick)="accept(inv.salonId)"
                    />
                    <p-button
                      label="Decline"
                      icon="pi pi-times"
                      severity="danger"
                      [outlined]="true"
                      size="small"
                      [loading]="processingId() === inv.salonId"
                      (onClick)="reject(inv.salonId)"
                    />
                  </div>
                </div>
              </p-card>
            }
          </div>
        }

        <!-- Accepted invitations -->
        @if (acceptedInvitations().length) {
          <div class="space-y-3">
            <h3 class="text-lg font-semibold text-zinc-700 dark:text-zinc-300">Accepted</h3>
            @for (inv of acceptedInvitations(); track inv.salonId) {
              <p-card styleClass="shadow-sm border border-zinc-200 dark:border-zinc-700">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-sm font-bold text-emerald-600 dark:text-emerald-400">
                      {{ inv.salonName.charAt(0).toUpperCase() }}
                    </div>
                    <div>
                      <p class="text-sm font-medium text-zinc-800 dark:text-zinc-100">{{ inv.salonName }}</p>
                      <p class="text-xs text-zinc-500">Joined {{ inv.invitedAt | date:'mediumDate' }}</p>
                    </div>
                  </div>
                  <p-tag value="Active" severity="success" />
                </div>
              </p-card>
            }
          </div>
        }

        <!-- Rejected invitations -->
        @if (rejectedInvitations().length) {
          <div class="space-y-3">
            <h3 class="text-lg font-semibold text-zinc-700 dark:text-zinc-300">Declined</h3>
            @for (inv of rejectedInvitations(); track inv.salonId) {
              <p-card styleClass="shadow-sm border border-zinc-200 dark:border-zinc-700 opacity-60">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-sm font-bold text-zinc-500">
                      {{ inv.salonName.charAt(0).toUpperCase() }}
                    </div>
                    <div>
                      <p class="text-sm font-medium text-zinc-600 dark:text-zinc-400">{{ inv.salonName }}</p>
                      <p class="text-xs text-zinc-400">Invited {{ inv.invitedAt | date:'mediumDate' }}</p>
                    </div>
                  </div>
                  <p-tag value="Declined" severity="danger" />
                </div>
              </p-card>
            }
          </div>
        }
      }
    </div>
  `,
})
export class StylistInvitationsComponent implements OnInit {
  private readonly userService    = inject(UserService);
  private readonly messageService = inject(MessageService);

  readonly loading      = signal(true);
  readonly invitations  = signal<SalonInvitationDto[]>([]);
  readonly processingId = signal<string | null>(null);

  readonly pendingInvitations  = signal<SalonInvitationDto[]>([]);
  readonly acceptedInvitations = signal<SalonInvitationDto[]>([]);
  readonly rejectedInvitations = signal<SalonInvitationDto[]>([]);

  ngOnInit(): void {
    this.loadInvitations();
  }

  loadInvitations(): void {
    this.loading.set(true);
    this.userService.getStylistInvitations().subscribe({
      next: (invs) => {
        this.invitations.set(invs);
        this.pendingInvitations.set(invs.filter((i) => i.status === 'pending'));
        this.acceptedInvitations.set(invs.filter((i) => i.status === 'accepted'));
        this.rejectedInvitations.set(invs.filter((i) => i.status === 'rejected'));
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Could not load invitations.' });
      },
    });
  }

  accept(salonId: string): void {
    this.processingId.set(salonId);
    this.userService.acceptInvitation(salonId).subscribe({
      next: () => {
        this.processingId.set(null);
        this.messageService.add({ severity: 'success', summary: 'Accepted!', detail: 'You have joined the salon.' });
        this.loadInvitations();
      },
      error: () => {
        this.processingId.set(null);
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to accept invitation.' });
      },
    });
  }

  reject(salonId: string): void {
    this.processingId.set(salonId);
    this.userService.rejectInvitation(salonId).subscribe({
      next: () => {
        this.processingId.set(null);
        this.messageService.add({ severity: 'warn', summary: 'Declined', detail: 'Invitation declined.' });
        this.loadInvitations();
      },
      error: () => {
        this.processingId.set(null);
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Failed to decline invitation.' });
      },
    });
  }

  statusSeverity(status: string): InvitationSeverity {
    switch (status) {
      case 'pending':  return 'warn';
      case 'accepted': return 'success';
      case 'rejected': return 'danger';
      default:         return 'info';
    }
  }
}
