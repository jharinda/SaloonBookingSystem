import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ContentChild,
  DestroyRef,
  ElementRef,
  TemplateRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';

import { Button } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';

/** Column descriptor for the calendar grid */
export interface CalendarColumn {
  id: string;
  name: string;
}

/** Context provided to each cell template */
export interface CalendarCellContext {
  /** Time slot string, e.g. "09:00" */
  time: string;
  /** Column identifier */
  columnId: string;
  /** Column display name */
  columnName: string;
}

/** Context provided to the before-row template */
export interface CalendarBeforeRowContext {
  /** Time slot string */
  time: string;
  /** All columns */
  columns: CalendarColumn[];
}

@Component({
  selector: 'lib-calendar-grid',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, Button, TooltipModule],
  templateUrl: './calendar-grid.component.html',
  styleUrl: './calendar-grid.component.scss',
})
export class CalendarGridComponent implements AfterViewInit {
  private readonly destroyRef = inject(DestroyRef);
  // Reference is on the wrapper so position: absolute is relative to it
  private readonly wrapperEl = viewChild<ElementRef<HTMLElement>>('wrapperEl');

  constructor() {
    // Re-calculate whenever data or zoom changes — deferred one microtask so
    // Angular has finished rendering the new rows before we read the DOM.
    effect(() => {
      const hasCols  = this.columns().length > 0;
      const hasSlots = this.timeSlots().length > 0;
      this.rowHeight(); // track zoom changes
      if (hasCols && hasSlots) {
        setTimeout(() => this.refreshNowIndicator(), 0);
      }
    });
  }

  // ── Inputs ─────────────────────────────────────────────────────────────
  /** Array of time slot labels, e.g. ['09:00', '09:30', '10:00', ...] */
  timeSlots = input.required<string[]>();

  /** Column definitions. Single column for stylist view, multiple for salon. */
  columns = input.required<CalendarColumn[]>();

  /** Show a loading spinner */
  loading = input(false);

  /** Message when there are no columns */
  emptyMessage = input('No data to display');

  /** Base row height in pixels (at 100 % zoom) */
  baseRowHeight = input(44);

  // ── Zoom state ─────────────────────────────────────────────────────────
  zoomLevel = signal(1);

  /** Actual row height after zoom */
  rowHeight = computed(() => Math.round(this.baseRowHeight() * this.zoomLevel()));

  /** Human-readable zoom label */
  zoomPercent = computed(() => Math.round(this.zoomLevel() * 100));

  // ── Outputs ────────────────────────────────────────────────────────────
  cellClick = output<{ time: string; columnId: string }>();

  // ── Content projection via templates ───────────────────────────────────
  /**
   * Template rendered for every cell in the grid.
   * Context: `CalendarCellContext` (available as `$implicit`).
   *
   * Usage:
   * ```html
   * <ng-template #cellTemplate let-ctx>
   *   <!-- ctx.time, ctx.columnId, ctx.columnName -->
   * </ng-template>
   * ```
   */
  @ContentChild('cellTemplate') cellTemplate!: TemplateRef<{ $implicit: CalendarCellContext }>;

  /**
   * Optional template rendered *before* each time-slot row.
   * Useful for break overlay rows that span all columns.
   * Context: `CalendarBeforeRowContext` (available as `$implicit`).
   */
  @ContentChild('beforeRowTemplate') beforeRowTemplate?: TemplateRef<{ $implicit: CalendarBeforeRowContext }>;

  // ── Now-indicator (DOM-based so variable row heights are handled) ────────
  nowIndicator = signal<{ visible: boolean; topPx: number; label: string }>({
    visible: false,
    topPx: 0,
    label: '',
  });

  ngAfterViewInit(): void {
    this.refreshNowIndicator();
    const timer = setInterval(() => this.refreshNowIndicator(), 30_000);
    this.destroyRef.onDestroy(() => clearInterval(timer));
  }

  /**
   * Reads the actual rendered position of the matching time-cell from the DOM
   * so that variable-height booking rows don't throw off the calculation.
   */
  private refreshNowIndicator(): void {
    const wrapper = this.wrapperEl()?.nativeElement;
    const slots = this.timeSlots();

    if (!wrapper || !slots.length) {
      this.nowIndicator.set({ visible: false, topPx: 0, label: '' });
      return;
    }

    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();

    const toMin = (s: string) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
    const slotDurationMin = slots.length > 1 ? toMin(slots[1]) - toMin(slots[0]) : 15;
    const startMin = toMin(slots[0]);
    const endMin   = toMin(slots[slots.length - 1]) + slotDurationMin;

    if (nowMin < startMin || nowMin > endMin) {
      this.nowIndicator.set({ visible: false, topPx: 0, label: '' });
      return;
    }

    // Find the last slot whose start is <= now
    let slotIdx = 0;
    for (let i = 0; i < slots.length; i++) {
      if (toMin(slots[i]) <= nowMin) slotIdx = i;
      else break;
    }

    // Query only regular time-cells (skip break-overlay cells which share the class)
    const timeCells = wrapper.querySelectorAll<HTMLElement>('.time-cell:not(.break-time-cell)');
    const cell = timeCells[slotIdx];
    if (!cell) {
      this.nowIndicator.set({ visible: false, topPx: 0, label: '' });
      return;
    }

    const wrapperTop = wrapper.getBoundingClientRect().top;
    const cellRect   = cell.getBoundingClientRect();
    const fraction   = (nowMin - toMin(slots[slotIdx])) / slotDurationMin;
    const topPx      = (cellRect.top - wrapperTop) + fraction * cellRect.height;

    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    this.nowIndicator.set({ visible: true, topPx, label: `${h}:${m}` });
  }

  /** When zoomed ≥ 1.5×, show :15/:45 sub-labels inside each 30-min time cell */
  showSubLabels = computed(() => this.zoomLevel() >= 1.5);

  /** Returns the midpoint time string for a 30-min slot, e.g. "09:00" → "09:15" */
  getSubTime(time: string): string {
    const [h, m] = time.split(':').map(Number);
    const sub = m + 15;
    return `${(sub >= 60 ? h + 1 : h).toString().padStart(2, '0')}:${(sub % 60).toString().padStart(2, '0')}`;
  }

  // ── Zoom actions ───────────────────────────────────────────────────────
  zoomIn(): void {
    this.zoomLevel.update((z) => Math.min(z + 0.25, 3));
  }

  zoomOut(): void {
    this.zoomLevel.update((z) => Math.max(z - 0.25, 0.5));
  }

  resetZoom(): void {
    this.zoomLevel.set(1);
  }
}
