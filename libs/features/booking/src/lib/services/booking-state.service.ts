import { Injectable, signal, computed } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

import { Salon, SalonServiceItem } from '@org/models';

// ─── Wizard State Interface ──────────────────────────────────────────────────

export interface BookingWizardState {
  salonId: string;
  salon: Salon | null;
  selectedServices: SalonServiceItem[];
  selectedStylistId: string | null; // null = "any available"
  selectedDate: Date | null;
  selectedTime: string | null; // "HH:mm"
  notes: string;
  currentStep: number;
}

const INITIAL_STATE: BookingWizardState = {
  salonId: '',
  salon: null,
  selectedServices: [],
  selectedStylistId: null,
  selectedDate: null,
  selectedTime: null,
  notes: '',
  currentStep: 0,
};

/**
 * Manages booking wizard state using BehaviorSubject for persistence
 * across step navigation. Uses Angular Signals for reactive UI updates.
 */
@Injectable()
export class BookingStateService {
  // ── Private state ────────────────────────────────────────────────────────────
  private readonly stateSubject = new BehaviorSubject<BookingWizardState>(INITIAL_STATE);

  // ── Public observables ───────────────────────────────────────────────────────
  readonly state$ = this.stateSubject.asObservable();

  // ── Public signals (for template bindings) ──────────────────────────────────
  readonly salon = signal<Salon | null>(null);
  readonly selectedServices = signal<SalonServiceItem[]>([]);
  readonly selectedStylistId = signal<string | null>(null);
  readonly selectedDate = signal<Date | null>(null);
  readonly selectedTime = signal<string | null>(null);
  readonly notes = signal<string>('');
  readonly currentStep = signal<number>(0);

  // ── Computed signals ─────────────────────────────────────────────────────────
  readonly totalPrice = computed(() =>
    this.selectedServices().reduce((sum, svc) => sum + svc.price, 0)
  );

  readonly totalDuration = computed(() =>
    this.selectedServices().reduce((sum, svc) => sum + svc.duration, 0)
  );

  readonly isStep1Valid = computed(() => this.selectedServices().length > 0);

  readonly isStep3Valid = computed(() =>
    this.selectedDate() !== null && this.selectedTime() !== null
  );

  // ── Getters ──────────────────────────────────────────────────────────────────
  get currentState(): BookingWizardState {
    return this.stateSubject.value;
  }

  // ── Initialization ───────────────────────────────────────────────────────────

  initState(salonId: string, salon: Salon): void {
    const newState: BookingWizardState = {
      ...INITIAL_STATE,
      salonId,
      salon,
    };
    this.stateSubject.next(newState);
    this.salon.set(salon);
    this.selectedServices.set([]);
    this.selectedStylistId.set(null);
    this.selectedDate.set(null);
    this.selectedTime.set(null);
    this.notes.set('');
    this.currentStep.set(0);
  }

  // ── Step 1: Services ─────────────────────────────────────────────────────────

  toggleService(service: SalonServiceItem): void {
    const current = this.selectedServices();
    const index = current.findIndex((s) => s._id === service._id);

    let updated: SalonServiceItem[];
    if (index >= 0) {
      // Remove service
      updated = current.filter((s) => s._id !== service._id);
    } else {
      // Add service
      updated = [...current, service];
    }

    this.selectedServices.set(updated);
    this.updateState({ selectedServices: updated });
  }

  clearServices(): void {
    this.selectedServices.set([]);
    this.updateState({ selectedServices: [] });
  }

  // ── Step 2: Stylist ──────────────────────────────────────────────────────────

  selectStylist(stylistId: string | null): void {
    this.selectedStylistId.set(stylistId);
    this.updateState({ selectedStylistId: stylistId });
  }

  // ── Step 3: Date & Time ──────────────────────────────────────────────────────

  selectDate(date: Date): void {
    this.selectedDate.set(date);
    this.selectedTime.set(null); // Reset time when date changes
    this.updateState({
      selectedDate: date,
      selectedTime: null,
    });
  }

  selectTime(time: string): void {
    this.selectedTime.set(time);
    this.updateState({ selectedTime: time });
  }

  // ── Step 4: Notes ────────────────────────────────────────────────────────────

  updateNotes(notes: string): void {
    this.notes.set(notes);
    this.updateState({ notes });
  }

  // ── Navigation ───────────────────────────────────────────────────────────────

  setStep(step: number): void {
    this.currentStep.set(step);
    this.updateState({ currentStep: step });
  }

  nextStep(): void {
    const next = this.currentStep() + 1;
    this.setStep(next);
  }

  previousStep(): void {
    const prev = Math.max(0, this.currentStep() - 1);
    this.setStep(prev);
  }

  // ── Reset ────────────────────────────────────────────────────────────────────

  reset(): void {
    this.stateSubject.next(INITIAL_STATE);
    this.salon.set(null);
    this.selectedServices.set([]);
    this.selectedStylistId.set(null);
    this.selectedDate.set(null);
    this.selectedTime.set(null);
    this.notes.set('');
    this.currentStep.set(0);
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private updateState(partial: Partial<BookingWizardState>): void {
    const current = this.stateSubject.value;
    this.stateSubject.next({ ...current, ...partial });
  }
}
