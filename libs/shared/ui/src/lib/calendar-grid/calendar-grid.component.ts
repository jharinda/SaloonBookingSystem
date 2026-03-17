import {
  ChangeDetectionStrategy,
  Component,
  ContentChild,
  TemplateRef,
  computed,
  input,
  output,
  signal,
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
export class CalendarGridComponent {
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
