import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CardModule } from 'primeng/card';
import { Button } from 'primeng/button';
import { ProgressSpinner } from 'primeng/progressspinner';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { MultiSelectModule } from 'primeng/multiselect';
import { InputNumberModule } from 'primeng/inputnumber';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { ChipModule } from 'primeng/chip';

import { DatePipe } from '@angular/common';
import {
  UserService,
  UserProfile,
  SalonInvitationDto,
} from '@org/shared-data-access';
import { TagModule } from 'primeng/tag';

interface SpecialtyOption {
  label: string;
  value: string;
}

@Component({
  selector: 'lib-stylist-details',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [MessageService],
  imports: [
    FormsModule,
    CardModule,
    Button,
    ProgressSpinner,
    InputTextModule,
    TextareaModule,
    MultiSelectModule,
    InputNumberModule,
    ToastModule,
    ChipModule,
    TagModule,
    DatePipe,
  ],
  template: `
    <p-toast />

    <div class="space-y-6">
      <h2 class="text-2xl font-bold text-zinc-800 dark:text-zinc-100">My Details</h2>

      @if (loading()) {
        <div class="flex items-center justify-center py-16">
          <p-progressSpinner strokeWidth="3" animationDuration=".8s" [style]="{ width: '36px', height: '36px' }" />
        </div>
      } @else {
        <!-- Working Salons -->
        @if (acceptedSalons().length) {
          <p-card header="Working At" styleClass="shadow-sm border border-zinc-200 dark:border-zinc-700">
            <div class="space-y-3">
              @for (salon of acceptedSalons(); track salon.salonId) {
                <div class="flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-900 rounded-lg">
                  <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center text-sm font-bold text-violet-600 dark:text-violet-400">
                      {{ salon.salonName.charAt(0).toUpperCase() }}
                    </div>
                    <div>
                      <p class="text-sm font-medium text-zinc-800 dark:text-zinc-100">{{ salon.salonName }}</p>
                      <p class="text-xs text-zinc-500">Joined {{ salon.respondedAt ? (salon.respondedAt | date:'mediumDate') : (salon.invitedAt | date:'mediumDate') }}</p>
                    </div>
                  </div>
                  <p-tag value="Active" severity="success" />
                </div>
              }
            </div>
          </p-card>
        } @else {
          <p-card styleClass="shadow-sm border border-zinc-200 dark:border-zinc-700">
            <div class="flex items-center gap-3 text-zinc-500 dark:text-zinc-400">
              <i class="pi pi-info-circle"></i>
              <span class="text-sm">You are not currently working at any salon. Accept an invitation to get started.</span>
            </div>
          </p-card>
        }

        <!-- Bio -->
        <p-card header="Bio" styleClass="shadow-sm border border-zinc-200 dark:border-zinc-700">
          <div class="flex flex-col gap-4">
            <textarea
              pTextarea
              [(ngModel)]="bio"
              placeholder="Tell clients about yourself, your experience, and what you specialize in..."
              [rows]="4"
              class="w-full"
              [maxlength]="1000"
            ></textarea>
            <div class="text-xs text-zinc-400 text-right">{{ bio().length }} / 1000</div>
          </div>
        </p-card>

        <!-- Years of Experience -->
        <p-card header="Experience" styleClass="shadow-sm border border-zinc-200 dark:border-zinc-700">
          <div class="flex items-center gap-4">
            <label class="text-sm text-zinc-600 dark:text-zinc-300 font-medium">Years of Experience</label>
            <p-inputNumber
              [(ngModel)]="yearsExperience"
              [min]="0"
              [max]="50"
              [showButtons]="true"
              buttonLayout="horizontal"
              incrementButtonIcon="pi pi-plus"
              decrementButtonIcon="pi pi-minus"
              [inputStyle]="{ width: '60px', textAlign: 'center' }"
            />
          </div>
        </p-card>

        <!-- Specialties -->
        <p-card header="Specialties" styleClass="shadow-sm border border-zinc-200 dark:border-zinc-700">
          <div class="flex flex-col gap-4">
            @if (loadingSpecialties()) {
              <div class="flex items-center gap-2 text-zinc-500">
                <p-progressSpinner strokeWidth="3" animationDuration=".8s" [style]="{ width: '20px', height: '20px' }" />
                <span class="text-sm">Loading specialties...</span>
              </div>
            } @else {
              <p-multiSelect
                [options]="specialtyOptions()"
                [(ngModel)]="selectedSpecialties"
                optionLabel="label"
                optionValue="value"
                placeholder="Select your specialties"
                [filter]="true"
                filterPlaceholder="Search specialties..."
                display="chip"
                [style]="{ width: '100%' }"
              />
              @if (!specialtyOptions().length) {
                <p class="text-sm text-zinc-500 italic">No specialties available yet. Contact an admin to add specialties.</p>
              }
            }

            <!-- Current specialties chips -->
            @if (selectedSpecialties().length) {
              <div class="flex flex-wrap gap-2 mt-2">
                @for (spec of selectedSpecialties(); track spec) {
                  <p-chip [label]="spec" [removable]="true" (onRemove)="removeSpecialty(spec)" styleClass="bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300" />
                }
              </div>
            }
          </div>
        </p-card>

        <!-- Save button -->
        <div class="flex justify-end">
          <p-button
            label="Save Changes"
            icon="pi pi-check"
            [loading]="saving()"
            (onClick)="save()"
            severity="help"
          />
        </div>
      }
    </div>
  `,
})
export class StylistDetailsComponent implements OnInit {
  private readonly userService    = inject(UserService);
  private readonly messageService = inject(MessageService);

  readonly loading     = signal(true);
  readonly saving      = signal(false);
  readonly loadingSpecialties = signal(true);
  readonly profile     = signal<UserProfile | null>(null);

  readonly bio                = signal('');
  readonly yearsExperience    = signal(0);
  readonly selectedSpecialties = signal<string[]>([]);
  readonly specialtyOptions   = signal<SpecialtyOption[]>([]);
  readonly acceptedSalons     = signal<SalonInvitationDto[]>([]);

  ngOnInit(): void {
    this.loadProfile();
    this.loadSpecialties();
    this.loadSalons();
  }

  private loadProfile(): void {
    this.loading.set(true);
    this.userService.getProfile().subscribe({
      next: (p) => {
        this.profile.set(p);
        if (p.stylistProfile) {
          this.bio.set(p.stylistProfile.bio ?? '');
          this.yearsExperience.set(p.stylistProfile.yearsExperience ?? 0);
          this.selectedSpecialties.set([...(p.stylistProfile.specialties ?? [])]);
        }
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Could not load profile.' });
      },
    });
  }

  private loadSalons(): void {
    this.userService.getStylistInvitations().subscribe({
      next: (invs) => {
        this.acceptedSalons.set(invs.filter((i) => i.status === 'accepted'));
      },
    });
  }

  private loadSpecialties(): void {
    this.loadingSpecialties.set(true);
    this.userService.getSpecialties().subscribe({
      next: (items) => {
        this.specialtyOptions.set(
          items.map((s) => ({ label: s.name, value: s.name })),
        );
        this.loadingSpecialties.set(false);
      },
      error: () => {
        this.loadingSpecialties.set(false);
      },
    });
  }

  removeSpecialty(spec: string): void {
    this.selectedSpecialties.update((list) => list.filter((s) => s !== spec));
  }

  save(): void {
    this.saving.set(true);
    this.userService
      .updateStylistProfile({
        bio: this.bio(),
        specialties: this.selectedSpecialties(),
        yearsExperience: this.yearsExperience(),
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.messageService.add({
            severity: 'success',
            summary: 'Saved',
            detail: 'Your profile has been updated.',
          });
        },
        error: () => {
          this.saving.set(false);
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: 'Failed to save profile.',
          });
        },
      });
  }
}
