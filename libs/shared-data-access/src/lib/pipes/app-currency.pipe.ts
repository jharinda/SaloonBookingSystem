import { Pipe, PipeTransform, inject } from '@angular/core';
import { CurrencyService } from '../services/currency.service';

/**
 * Formats a numeric value with the user's region-based currency.
 *
 * Usage:
 *   {{ amount | appCurrency }}          → "LKR 2,500"
 *   {{ amount | appCurrency:true }}     → "LKR 2,500.00"
 */
@Pipe({ name: 'appCurrency', standalone: true, pure: false })
export class AppCurrencyPipe implements PipeTransform {
  private readonly currencyService = inject(CurrencyService);

  transform(value: number | null | undefined, showDecimals = false): string {
    if (value == null) return '';
    return this.currencyService.format(value, showDecimals);
  }
}
