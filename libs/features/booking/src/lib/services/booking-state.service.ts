import { Injectable, signal, computed } from '@angular/core';

import { Salon, SalonServiceItem } from '@org/models';

/**
 * Manages booking wizard state using Angular Signals.
 * Single source of truth for all wizard state and derived values.
 */
@Injectable()
export class BookingStateService {

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

  // ── Initialization ───────────────────────────────────────────────────────────

  initState(salonId: string, salon: Salon): void {
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
  }

  clearServices(): void {
    this.selectedServices.set([]);
  }

  // ── Step 2: Stylist ──────────────────────────────────────────────────────────

  selectStylist(stylistId: string | null): void {
    this.selectedStylistId.set(stylistId);
  }

  // ── Step 3: Date & Time ──────────────────────────────────────────────────────

  selectDate(date: Date): void {
    this.selectedDate.set(date);
    this.selectedTime.set(null); // Reset time when date changes
  }

  selectTime(time: string): void {
    this.selectedTime.set(time);
  }

  // ── Step 4: Notes ────────────────────────────────────────────────────────────

  updateNotes(notes: string): void {
    this.notes.set(notes);
  }

  // ── Navigation ───────────────────────────────────────────────────────────────

  setStep(step: number): void {
    this.currentStep.set(step);
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
    this.salon.set(null);
    this.selectedServices.set([]);
    this.selectedStylistId.set(null);
    this.selectedDate.set(null);
    this.selectedTime.set(null);
    this.notes.set('');
    this.currentStep.set(0);
  }
}
