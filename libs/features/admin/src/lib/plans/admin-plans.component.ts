import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import { Card } from 'primeng/card';
import { Button } from 'primeng/button';
import { InputNumber } from 'primeng/inputnumber';
import { InputText } from 'primeng/inputtext';
import { Checkbox } from 'primeng/checkbox';
import { Divider } from 'primeng/divider';
import { Skeleton } from 'primeng/skeleton';
import { Toast } from 'primeng/toast';
import { MessageService } from 'primeng/api';

import { AdminService, AdminPlanConfig, AdminUpdatePlanDto } from '@org/shared-data-access';

const PLAN_ORDER = ['starter', 'basic', 'pro', 'franchise'] as const;
type PlanKey = (typeof PLAN_ORDER)[number];

const ALL_FEATURES: Array<{ key: string; label: string; desc: string }> = [
  { key: 'basic_booking',      label: 'Booking Management',    desc: 'Core appointment booking flow' },
  { key: 'email_notifications', label: 'Email Notifications',  desc: 'Automated booking emails' },
  { key: 'sms_notifications',  label: 'SMS Notifications',     desc: 'SMS alerts for bookings & reminders' },
  { key: 'google_calendar',    label: 'Google Calendar Sync',  desc: 'Sync appointments to Google Calendar' },
  { key: 'whatsapp',           label: 'WhatsApp integration',   desc: 'WhatsApp Business messaging & reminders' },
  { key: 'instagram',          label: 'Instagram integration', desc: 'Instagram DM via Meta Business' },
  { key: 'analytics',          label: 'Advanced Analytics',    desc: 'Revenue charts & staff performance' },
  { key: 'priority_support',   label: 'Priority Support',      desc: 'Dedicated support channel' },
];

interface PlanEditState {
  key: PlanKey;
  name: string;
  price: number;
  maxStaff: number;
  maxStations: number;
  maxLocations: number;
  trialDays: number | null;
  features: string[];
  allFeatures: boolean;
  saving: boolean;
  dirty: boolean;
}

@Component({
  selector: 'lib-admin-plans',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [MessageService],
  imports: [
    FormsModule,
    Card,
    Button,
    InputNumber,
    InputText,
    Checkbox,
    Divider,
    Skeleton,
    Toast,
  ],
  template: `
<p-toast />

<div class="p-6">
  <div class="mb-8">
    <h1 class="text-2xl font-bold text-zinc-900 dark:text-zinc-100 m-0">Plan Configuration</h1>
    <p class="text-sm text-zinc-500 dark:text-zinc-400 mt-1 mb-0">
      Edit pricing, limits, and features for each subscription plan. Changes take effect immediately for new feature checks.
    </p>
  </div>

  @if (isLoading()) {
    <div class="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-5">
      @for (sk of [1,2,3,4]; track sk) {
        <p-card styleClass="shadow-sm">
          <p-skeleton width="60%" height="1.5rem" styleClass="mb-3" />
          <p-skeleton width="100%" height="2.5rem" styleClass="mb-2" />
          <p-skeleton width="100%" height="2.5rem" styleClass="mb-4" />
          @for (f of [1,2,3,4,5]; track f) {
            <p-skeleton width="80%" height="1rem" styleClass="mb-2" />
          }
        </p-card>
      }
    </div>
  } @else {

    <div class="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-5">
      @for (plan of planStates(); track plan.key) {
        <div
          class="relative flex flex-col rounded-2xl border transition-all"
          [class]="plan.key === 'pro'
            ? 'border-violet-400 dark:border-violet-600 bg-white dark:bg-zinc-900'
            : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900'"
        >
          @if (plan.key === 'pro') {
            <div class="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-violet-500 text-white text-xs font-semibold whitespace-nowrap">
              Most Popular
            </div>
          }

          <div class="p-5 flex flex-col flex-1 gap-4">

            <!-- Header -->
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold uppercase tracking-widest text-zinc-400">{{ plan.key }}</span>
              @if (plan.dirty) {
                <span class="text-xs text-amber-500 font-medium">Unsaved</span>
              }
            </div>

            <!-- Plan name -->
            <div>
              <label class="text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-1 block">Plan Name</label>
              <input
                pInputText
                [(ngModel)]="plan.name"
                (ngModelChange)="markDirty(plan)"
                class="w-full text-sm"
                placeholder="Plan name"
              />
            </div>

            <!-- Price -->
            <div>
              <label class="text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-1 block">
                Price (LKR / month)
              </label>
              <p-inputnumber
                [(ngModel)]="plan.price"
                (ngModelChange)="markDirty(plan)"
                [min]="0"
                [showButtons]="false"
                styleClass="w-full"
                inputStyleClass="w-full text-sm"
                placeholder="0 = free"
              />
            </div>

            <!-- Limits -->
            <div class="grid grid-cols-3 gap-2">
              <div>
                <label class="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide mb-1 block">Staff</label>
                <p-inputnumber
                  [(ngModel)]="plan.maxStaff"
                  (ngModelChange)="markDirty(plan)"
                  [min]="-1"
                  [showButtons]="false"
                  styleClass="w-full"
                  inputStyleClass="w-full text-xs text-center px-1"
                  [title]="'-1 = unlimited'"
                />
              </div>
              <div>
                <label class="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide mb-1 block">Stations</label>
                <p-inputnumber
                  [(ngModel)]="plan.maxStations"
                  (ngModelChange)="markDirty(plan)"
                  [min]="-1"
                  [showButtons]="false"
                  styleClass="w-full"
                  inputStyleClass="w-full text-xs text-center px-1"
                />
              </div>
              <div>
                <label class="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide mb-1 block">Locations</label>
                <p-inputnumber
                  [(ngModel)]="plan.maxLocations"
                  (ngModelChange)="markDirty(plan)"
                  [min]="-1"
                  [showButtons]="false"
                  styleClass="w-full"
                  inputStyleClass="w-full text-xs text-center px-1"
                />
              </div>
            </div>
            <p class="text-[10px] text-zinc-400 -mt-2 m-0">Set -1 for unlimited</p>

            <!-- Trial days -->
            @if (plan.key === 'starter') {
              <div>
                <label class="text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-1 block">Trial Days</label>
                <p-inputnumber
                  [(ngModel)]="plan.trialDays"
                  (ngModelChange)="markDirty(plan)"
                  [min]="0"
                  [showButtons]="false"
                  styleClass="w-full"
                  inputStyleClass="w-full text-sm"
                  placeholder="30"
                />
              </div>
            }

            <p-divider styleClass="my-0" />

            <!-- Features -->
            <div>
              <p class="text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-3 m-0 uppercase tracking-wide">Features</p>

              <!-- All features master toggle -->
              <div class="flex items-center gap-2 mb-3 pb-3 border-b border-zinc-100 dark:border-zinc-800">
                <p-checkbox
                  [(ngModel)]="plan.allFeatures"
                  [binary]="true"
                  inputId="all-{{ plan.key }}"
                  (ngModelChange)="onAllFeaturesToggle(plan, $event)"
                />
                <label [for]="'all-' + plan.key" class="text-sm font-semibold text-emerald-600 dark:text-emerald-400 cursor-pointer">
                  All Features
                </label>
              </div>

              <!-- Individual feature toggles -->
              @for (feature of allFeatures; track feature.key) {
                <div class="flex items-start gap-2 mb-2">
                  <p-checkbox
                    [ngModel]="isFeatureEnabled(plan, feature.key)"
                    [binary]="true"
                    [inputId]="feature.key + '-' + plan.key"
                    [disabled]="plan.allFeatures"
                    (ngModelChange)="toggleFeature(plan, feature.key, $event)"
                    styleClass="mt-0.5"
                  />
                  <label
                    [for]="feature.key + '-' + plan.key"
                    class="cursor-pointer"
                    [class.opacity-50]="plan.allFeatures"
                  >
                    <span class="text-sm text-zinc-800 dark:text-zinc-200 block">{{ feature.label }}</span>
                    <span class="text-xs text-zinc-400">{{ feature.desc }}</span>
                  </label>
                </div>
              }
            </div>

            <!-- Save button -->
            <div class="mt-auto pt-2">
              <p-button
                label="Save Plan"
                icon="pi pi-save"
                [loading]="plan.saving"
                [disabled]="!plan.dirty"
                severity="success"
                styleClass="w-full"
                (onClick)="savePlan(plan)"
              />
            </div>

          </div>
        </div>
      }
    </div>

  }
</div>
  `,
})
export class AdminPlansComponent implements OnInit {
  private readonly adminService  = inject(AdminService);
  private readonly messageService = inject(MessageService);

  readonly isLoading  = signal(true);
  readonly planStates = signal<PlanEditState[]>([]);

  readonly allFeatures = ALL_FEATURES;

  ngOnInit(): void {
    this.adminService.getPlansConfig().subscribe({
      next: (plans) => {
        const states: PlanEditState[] = PLAN_ORDER.map((key) => {
          const config: AdminPlanConfig = plans[key] ?? {
            name: key,
            price: 0,
            maxLocations: 1,
            maxStaff: 3,
            maxStations: 2,
            features: [],
          };
          const hasAll = config.features.includes('all');
          return {
            key,
            name:         config.name,
            price:        config.price,
            maxStaff:     config.maxStaff,
            maxStations:  config.maxStations,
            maxLocations: config.maxLocations,
            trialDays:    config.trialDays ?? null,
            features:     [...config.features],
            allFeatures:  hasAll,
            saving:       false,
            dirty:        false,
          };
        });
        this.planStates.set(states);
        this.isLoading.set(false);
      },
      error: () => {
        this.isLoading.set(false);
        this.toast('error', 'Failed to load plan configurations');
      },
    });
  }

  markDirty(plan: PlanEditState): void {
    plan.dirty = true;
    this.planStates.update((s) => [...s]);
  }

  isFeatureEnabled(plan: PlanEditState, feature: string): boolean {
    return plan.features.includes(feature) || plan.features.includes('all');
  }

  toggleFeature(plan: PlanEditState, feature: string, enabled: boolean): void {
    if (enabled) {
      if (!plan.features.includes(feature)) plan.features = [...plan.features, feature];
    } else {
      plan.features = plan.features.filter((f) => f !== feature);
    }
    plan.dirty = true;
    this.planStates.update((s) => [...s]);
  }

  onAllFeaturesToggle(plan: PlanEditState, enabled: boolean): void {
    if (enabled) {
      plan.features = ['all'];
    } else {
      plan.features = [];
    }
    plan.dirty = true;
    this.planStates.update((s) => [...s]);
  }

  savePlan(plan: PlanEditState): void {
    plan.saving = true;
    this.planStates.update((s) => [...s]);

    const dto: AdminUpdatePlanDto = {
      name:         plan.name,
      price:        plan.price,
      maxStaff:     plan.maxStaff,
      maxStations:  plan.maxStations,
      maxLocations: plan.maxLocations,
      trialDays:    plan.trialDays,
      features:     plan.allFeatures ? ['all'] : [...plan.features],
    };

    this.adminService.updatePlanConfig(plan.key, dto).subscribe({
      next: () => {
        plan.saving = false;
        plan.dirty  = false;
        this.planStates.update((s) => [...s]);
        this.toast('success', `${plan.name} plan saved successfully`);
      },
      error: () => {
        plan.saving = false;
        this.planStates.update((s) => [...s]);
        this.toast('error', `Failed to save ${plan.name} plan`);
      },
    });
  }

  private toast(severity: 'success' | 'error', detail: string): void {
    this.messageService.add({
      severity,
      summary: severity === 'error' ? 'Error' : 'Saved',
      detail,
      life: 4000,
    });
  }
}
