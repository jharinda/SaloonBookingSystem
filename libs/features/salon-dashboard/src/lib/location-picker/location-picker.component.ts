import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  EventEmitter,
  OnDestroy,
  Output,
  ViewEncapsulation,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import * as L from 'leaflet';

export interface SelectedLocation {
  lat: number;
  lng: number;
  address: string;
  city: string;
  street: string;
}

// Fix Leaflet's default marker icon paths broken by bundlers
const DEFAULT_ICON = L.icon({
  iconUrl:       'assets/leaflet/marker-icon.png',
  iconRetinaUrl: 'assets/leaflet/marker-icon-2x.png',
  shadowUrl:     'assets/leaflet/marker-shadow.png',
  iconSize:    [25, 41],
  iconAnchor:  [12, 41],
  popupAnchor: [1, -34],
  shadowSize:  [41, 41],
});

/** Default centre — Colombo, Sri Lanka */
const COLOMBO: L.LatLngTuple = [6.9271, 79.8612];
const DEFAULT_ZOOM = 13;

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  address?: {
    road?: string;
    house_number?: string;
    city?: string;
    town?: string;
    village?: string;
    county?: string;
    suburb?: string;
  };
}

@Component({
  selector: 'lib-location-picker',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  // ViewEncapsulation.None so the Leaflet CSS (imported globally) applies inside
  encapsulation: ViewEncapsulation.None,
  imports: [FormsModule],
  template: `
    <div class="location-picker">

      <!-- Address search box -->
      <div class="location-picker__search">
        <div class="search-input-wrap">
          <i class="pi pi-search search-icon"></i>
          <input
            class="search-input"
            type="text"
            placeholder="Search address or place…"
            [(ngModel)]="searchQuery"
            (keydown.enter)="searchAddress()"
            (input)="onSearchInput()"
          />
          @if (searchQuery) {
            <button class="search-clear" type="button" (click)="clearSearch()">
              <i class="pi pi-times"></i>
            </button>
          }
          <button class="search-btn" type="button" (click)="searchAddress()" [disabled]="isSearching()">
            @if (isSearching()) { <i class="pi pi-spin pi-spinner"></i> }
            @else { Search }
          </button>
        </div>

        <!-- Search results dropdown -->
        @if (searchResults().length > 0) {
          <ul class="search-results">
            @for (r of searchResults(); track r.place_id) {
              <li class="search-result-item" (click)="selectResult(r)">
                <i class="pi pi-map-marker result-icon"></i>
                <span>{{ r.display_name }}</span>
              </li>
            }
          </ul>
        }
        @if (searchError()) {
          <p class="search-error">{{ searchError() }}</p>
        }
      </div>

      <!-- Map container -->
      <div #mapEl class="location-picker__map"></div>

      <!-- Info bar -->
      <div class="location-picker__info">
        @if (geocoding()) {
          <span class="info-text"><i class="pi pi-spin pi-spinner"></i> Fetching address…</span>
        } @else if (selectedLat() !== null) {
          <span class="info-text">
            <i class="pi pi-check-circle info-ok"></i>
            <strong>{{ selectedLat()!.toFixed(5) }}, {{ selectedLng()!.toFixed(5) }}</strong>
            &nbsp;—&nbsp;{{ selectedAddress() }}
          </span>
        } @else {
          <span class="info-hint">Click on the map or drag the marker to pick a location</span>
        }
      </div>

    </div>
  `,
  styles: [`
    .location-picker { position: relative; display: flex; flex-direction: column; gap: 8px; }

    /* ── Search ─────────────────────────────────────────────────────────── */
    .location-picker__search { position: relative; z-index: 1000; }

    .search-input-wrap {
      display: flex;
      align-items: center;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      overflow: hidden;
      background: #fff;
      box-shadow: 0 1px 3px rgba(0,0,0,.07);
    }

    .search-icon {
      padding: 0 10px;
      color: #9ca3af;
      font-size: .85rem;
      flex-shrink: 0;
    }

    .search-input {
      flex: 1;
      border: none;
      outline: none;
      padding: 10px 6px;
      font-size: .9rem;
      background: transparent;
      min-width: 0;
    }

    .search-clear {
      background: none;
      border: none;
      cursor: pointer;
      color: #9ca3af;
      padding: 0 8px;
      font-size: .8rem;
      line-height: 1;
    }
    .search-clear:hover { color: #374151; }

    .search-btn {
      background: #7c3aed;
      color: #fff;
      border: none;
      cursor: pointer;
      padding: 10px 18px;
      font-size: .875rem;
      font-weight: 500;
      white-space: nowrap;
      flex-shrink: 0;
      transition: background .15s;
    }
    .search-btn:hover:not(:disabled) { background: #6d28d9; }
    .search-btn:disabled { opacity: .6; cursor: default; }

    .search-results {
      list-style: none;
      margin: 0;
      padding: 4px 0;
      background: #fff;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,.12);
      max-height: 220px;
      overflow-y: auto;
      position: absolute;
      top: calc(100% + 4px);
      left: 0;
      right: 0;
    }

    .search-result-item {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      padding: 10px 14px;
      cursor: pointer;
      font-size: .875rem;
      color: #374151;
      transition: background .12s;
      border-bottom: 1px solid #f3f4f6;
    }
    .search-result-item:last-child { border-bottom: none; }
    .search-result-item:hover { background: #f5f3ff; }

    .result-icon { color: #7c3aed; flex-shrink: 0; margin-top: 2px; font-size: .85rem; }

    .search-error {
      color: #dc2626;
      font-size: .8rem;
      margin: 4px 0 0;
      padding: 6px 10px;
      background: #fef2f2;
      border-radius: 6px;
    }

    /* ── Map ─────────────────────────────────────────────────────────────── */
    .location-picker__map {
      width:  100%;
      height: 360px;
      border-radius: 8px;
      border: 1px solid #e5e7eb;
      z-index: 0;
      cursor: crosshair;
    }

    /* ── Info bar ────────────────────────────────────────────────────────── */
    .location-picker__info {
      min-height: 28px;
      font-size: .8rem;
    }

    .info-text {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: #374151;
    }

    .info-ok { color: #16a34a; font-size: .9rem; }

    .info-hint { color: #9ca3af; font-style: italic; }

    /* ── Dark mode ───────────────────────────────────────────────────────── */
    :host-context(.app-dark) {
      .search-input-wrap { background: #27272a; border-color: #3f3f46; }
      .search-input { color: #f4f4f5; }
      .search-input::placeholder { color: #71717a; }
      .search-results { background: #27272a; border-color: #3f3f46; }
      .search-result-item { color: #d4d4d8; border-color: #3f3f46; }
      .search-result-item:hover { background: #3f3f46; }
      .info-text { color: #d4d4d8; }
    }
  `],
})
export class LocationPickerComponent implements AfterViewInit, OnDestroy {
  @Output() locationSelected = new EventEmitter<SelectedLocation>();

  private readonly mapEl  = viewChild.required<ElementRef<HTMLDivElement>>('mapEl');
  private readonly cdr    = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);

  private map!: L.Map;
  private marker!: L.Marker;
  private debounceTimer:  ReturnType<typeof setTimeout> | null = null;
  private searchDebounce: ReturnType<typeof setTimeout> | null = null;

  protected searchQuery   = '';
  protected geocoding     = signal(false);
  protected isSearching   = signal(false);
  protected searchResults = signal<NominatimResult[]>([]);
  protected searchError   = signal<string | null>(null);
  protected selectedLat   = signal<number | null>(null);
  protected selectedLng   = signal<number | null>(null);
  protected selectedAddress = signal('');

  ngAfterViewInit(): void {
    this.map = L.map(this.mapEl().nativeElement, {
      center:      COLOMBO,
      zoom:        DEFAULT_ZOOM,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(this.map);

    this.marker = L.marker(COLOMBO, {
      draggable: true,
      icon: DEFAULT_ICON,
    }).addTo(this.map);

    // Drag-end reverse geocode
    this.marker.on('dragend', () => {
      const { lat, lng } = this.marker.getLatLng();
      this.scheduleGeocode(lat, lng);
    });

    // Click on map to move marker
    this.map.on('click', (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;
      this.marker.setLatLng([lat, lng]);
      this.scheduleGeocode(lat, lng);
    });
  }

  ngOnDestroy(): void {
    if (this.debounceTimer)  clearTimeout(this.debounceTimer);
    if (this.searchDebounce) clearTimeout(this.searchDebounce);
    this.map?.remove();
  }

  // ── Search ─────────────────────────────────────────────────────────────────

  protected onSearchInput(): void {
    this.searchResults.set([]);
    this.searchError.set(null);
  }

  protected clearSearch(): void {
    this.searchQuery = '';
    this.searchResults.set([]);
    this.searchError.set(null);
  }

  protected async searchAddress(): Promise<void> {
    const q = this.searchQuery.trim();
    if (!q) return;

    this.searchResults.set([]);
    this.searchError.set(null);
    this.isSearching.set(true);
    this.cdr.markForCheck();

    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&addressdetails=1&limit=5`;
      const res  = await fetch(url, { headers: { 'Accept-Language': 'en' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const results = await res.json() as NominatimResult[];

      if (results.length === 0) {
        this.searchError.set('No results found. Try a more specific address.');
      } else {
        this.searchResults.set(results);
      }
    } catch {
      this.searchError.set('Search failed. Check your connection and try again.');
    } finally {
      this.isSearching.set(false);
      this.cdr.markForCheck();
    }
  }

  protected selectResult(result: NominatimResult): void {
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);

    this.marker.setLatLng([lat, lng]);
    this.map.setView([lat, lng], 16);

    this.searchResults.set([]);

    const addr   = result.address;
    const street = [addr?.house_number, addr?.road].filter(Boolean).join(' ');
    const city   = addr?.city ?? addr?.town ?? addr?.village ?? addr?.county ?? '';

    this.selectedLat.set(lat);
    this.selectedLng.set(lng);
    this.selectedAddress.set(result.display_name);
    this.cdr.markForCheck();

    this.locationSelected.emit({ lat, lng, address: result.display_name, city, street });
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /** Debounce reverse-geocoding calls by 800 ms to respect Nominatim rate limits. */
  private scheduleGeocode(lat: number, lng: number): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => void this.geocode(lat, lng), 800);
  }

  private async geocode(lat: number, lng: number): Promise<void> {
    this.geocoding.set(true);
    this.cdr.markForCheck();

    try {
      const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`;
      const res  = await fetch(url, { headers: { 'Accept-Language': 'en' } });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json() as NominatimResult;

      const addr   = data.address;
      const street = [addr?.house_number, addr?.road].filter(Boolean).join(' ');
      const city   = addr?.city ?? addr?.town ?? addr?.village ?? addr?.county ?? addr?.suburb ?? '';
      const address = data.display_name ?? `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

      this.selectedLat.set(lat);
      this.selectedLng.set(lng);
      this.selectedAddress.set(address);
      this.cdr.markForCheck();

      this.locationSelected.emit({ lat, lng, address, city, street });
    } catch {
      this.selectedLat.set(lat);
      this.selectedLng.set(lng);
      this.selectedAddress.set(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
      this.cdr.markForCheck();

      this.locationSelected.emit({
        lat,
        lng,
        address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
        city:    '',
        street:  '',
      });
    } finally {
      this.geocoding.set(false);
      this.cdr.markForCheck();
    }
  }
}
