import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Select } from 'primeng/select';
import { LanguageService, SupportedLang } from '@org/shared-data-access';

interface LangOption {
  label: string;
  value: SupportedLang;
}

@Component({
  selector: 'app-language-switcher',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, Select],
  template: `
    <p-select
      [options]="langs"
      [ngModel]="languageService.currentLang()"
      (ngModelChange)="languageService.switchLanguage($event)"
      optionLabel="label"
      optionValue="value"
      styleClass="lang-select"
      [style]="{ minWidth: '72px' }"
      aria-label="Select language"
    />
  `,
  styles: [`
    :host ::ng-deep .lang-select .p-select-label {
      padding: 0.25rem 0.5rem;
      font-size: 0.8rem;
      font-weight: 500;
    }
    :host ::ng-deep .lang-select.p-select {
      border-radius: 8px;
    }
  `],
})
export class LanguageSwitcherComponent {
  protected readonly languageService = inject(LanguageService);

  protected readonly langs: LangOption[] = [
    { label: 'EN', value: 'en' },
    { label: 'සි', value: 'si' },
    { label: 'த', value: 'ta' },
  ];
}
