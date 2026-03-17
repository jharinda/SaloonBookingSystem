import { Injectable, inject, signal, computed } from '@angular/core';
import { UserService } from './user.service';
import { AuthService } from './auth.service';

/**
 * Map of ISO 4217 currency codes → display symbols.
 * Expand as needed when new regions are supported.
 */
const CURRENCY_SYMBOLS: Record<string, string> = {
  LKR: 'LKR',
  USD: '$',
  EUR: '€',
  GBP: '£',
  INR: '₹',
  AUD: 'A$',
  CAD: 'C$',
  RON: 'RON',
};

const DEFAULT_CURRENCY = 'LKR';

@Injectable({ providedIn: 'root' })
export class CurrencyService {
  private readonly userService = inject(UserService);
  private readonly authService = inject(AuthService);

  /** The active ISO 4217 currency code. */
  readonly currencyCode = signal<string>(DEFAULT_CURRENCY);

  /** Human-readable symbol (e.g. '$', '€', 'LKR'). */
  readonly currencySymbol = computed(
    () => CURRENCY_SYMBOLS[this.currencyCode()] ?? this.currencyCode(),
  );

  /**
   * Call once after the user logs in (or on app init when a session is restored).
   * Fetches the user profile and sets the currency from the backend.
   */
  loadFromProfile(): void {
    if (!this.authService.isLoggedIn()) return;

    this.userService.getProfile().subscribe({
      next: (profile) => {
        if (profile.currency) {
          this.currencyCode.set(profile.currency);
        }
      },
    });
  }

  /**
   * Format a numeric amount with the active currency symbol.
   *
   * @example
   *   format(2500)       // "LKR 2,500"
   *   format(2500, true) // "LKR 2,500.00"
   */
  format(amount: number, showDecimals = false): string {
    const formatted = showDecimals
      ? amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : amount.toLocaleString();
    return `${this.currencySymbol()} ${formatted}`;
  }
}
