import { Injectable, inject, signal, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { TranslateService } from '@ngx-translate/core';
import { PrimeNG } from 'primeng/config';

export type SupportedLang = 'en' | 'si' | 'ta';

const LANG_STORAGE_KEY = 'snapsalon-lang';
const DEFAULT_LANG: SupportedLang = 'en';
const SUPPORTED_LANGS: SupportedLang[] = ['en', 'si', 'ta'];

/** Minimal PrimeNG locale data for each supported language. */
const PRIME_LOCALES: Record<SupportedLang, object> = {
  en: {
    dayNames: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    dayNamesShort: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    dayNamesMin: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
    monthNames: ['January','February','March','April','May','June','July','August','September','October','November','December'],
    monthNamesShort: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
    today: 'Today',
    clear: 'Clear',
    firstDayOfWeek: 0,
  },
  si: {
    dayNames: ['ඉරිදා','සඳුදා','අඟහරුවාදා','බදාදා','බ්‍රහස්පතින්දා','සිකුරාදා','සෙනසුරාදා'],
    dayNamesShort: ['ඉරු','සඳ','අඟ','බදා','බ්‍රහ','සිකු','සෙන'],
    dayNamesMin: ['ඉ','ස','අ','බ','බ්‍ර','සි','සෙ'],
    monthNames: ['ජනවාරි','පෙබරවාරි','මාර්තු','අප්‍රේල්','මැයි','ජූනි','ජූලි','අගෝස්තු','සැප්තැම්බර්','ඔක්තෝබර්','නොවැම්බර්','දෙසැම්බර්'],
    monthNamesShort: ['ජන','පෙබ','මාර්','අප්‍රේ','මැයි','ජූනි','ජූලි','අගෝ','සැප්','ඔක්','නොවැ','දෙසැ'],
    today: 'අද',
    clear: 'ඉවත් කරන්න',
    firstDayOfWeek: 1,
  },
  ta: {
    dayNames: ['ஞாயிற்றுக்கிழமை','திங்கட்கிழமை','செவ்வாய்க்கிழமை','புதன்கிழமை','வியாழக்கிழமை','வெள்ளிக்கிழமை','சனிக்கிழமை'],
    dayNamesShort: ['ஞா','தி','செ','பு','வி','வெ','சனி'],
    dayNamesMin: ['ஞா','தி','செ','பு','வி','வெ','ச'],
    monthNames: ['ஜனவரி','பிப்ரவரி','மார்ச்','ஏப்ரல்','மே','ஜூன்','ஜூலை','ஆகஸ்ட்','செப்டம்பர்','அக்டோபர்','நவம்பர்','டிசம்பர்'],
    monthNamesShort: ['ஜன','பிப்','மார்','ஏப்','மே','ஜூன்','ஜூலை','ஆக','செப்','அக்','நவ','டிச'],
    today: 'இன்று',
    clear: 'நீக்கு',
    firstDayOfWeek: 1,
  },
};

@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly translateService = inject(TranslateService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly primeNG = inject(PrimeNG);

  readonly currentLang = signal<SupportedLang>(DEFAULT_LANG);

  init(): void {
    const stored = isPlatformBrowser(this.platformId)
      ? (localStorage.getItem(LANG_STORAGE_KEY) as SupportedLang | null)
      : null;

    const lang: SupportedLang =
      stored && SUPPORTED_LANGS.includes(stored) ? stored : DEFAULT_LANG;

    this._applyLang(lang);
  }

  switchLanguage(lang: SupportedLang): void {
    if (!SUPPORTED_LANGS.includes(lang)) return;
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem(LANG_STORAGE_KEY, lang);
    }
    this._applyLang(lang);
  }

  private _applyLang(lang: SupportedLang): void {
    this.translateService.use(lang);
    this.primeNG.setTranslation(PRIME_LOCALES[lang]);
    this.currentLang.set(lang);
  }
}
