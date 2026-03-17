import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { DecimalPipe, NgOptimizedImage } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Card } from 'primeng/card';
import { Button } from 'primeng/button';
import { Rating } from 'primeng/rating';

import { Salon, SalonServiceItem } from '@org/models';
import { AppCurrencyPipe } from '@org/shared-data-access';


@Component({
  selector: 'lib-salon-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, NgOptimizedImage, FormsModule, Card, Button, Rating, AppCurrencyPipe],
  template: `
    <p-card
      styleClass="salon-card-primeng h-full flex flex-col overflow-hidden"
      (click)="onCardClick()"
      (keydown.enter)="onCardClick()"
      role="article"
      tabindex="0"
    >
      <ng-template #header>
        <div class="relative w-full overflow-hidden bg-gray-100 dark:bg-zinc-700" style="aspect-ratio:16/9">
          @if (coverImage()) {
            <img
              class="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
              [ngSrc]="coverImage()!"
              [alt]="salon().name"
              fill
              sizes="(max-width: 640px) 100vw, 33vw"
              (error)="onImgError($event)"
            />
          } @else {
            <div class="flex flex-col items-center justify-center w-full h-full gap-2 text-gray-300 dark:text-zinc-600">
              <i class="pi pi-image text-4xl"></i>
            </div>
          }
          @if (!salon().isActive || !salon().isApproved) {
            <span class="absolute top-2 left-2 bg-black/60 text-white text-xs font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide">
              Closed
            </span>
          }
        </div>
      </ng-template>

      <div class="flex flex-col gap-2 flex-1 px-1 pt-1">
        <div>
          <h3 class="font-bold text-gray-900 dark:text-white text-base leading-tight truncate m-0">{{ salon().name }}</h3>
          <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5 flex items-center gap-1 m-0">
            <i class="pi pi-map-marker text-purple-500 text-xs"></i>
            {{ salon().address.city }}
          </p>
        </div>

        <!-- PrimeNG Rating (read-only) -->
        <div class="flex items-center gap-2">
          <p-rating [ngModel]="salon().rating" [readonly]="true" />
          <span class="text-sm font-semibold text-gray-700 dark:text-gray-300">{{ salon().rating | number: '1.1-1' }}</span>
          <span class="text-xs text-gray-400 dark:text-gray-500">({{ salon().reviewCount }})</span>
        </div>

        <!-- Top 3 services -->
        <ul class="list-none p-0 m-0 flex flex-col gap-1.5 flex-1">
          @for (svc of topServices(); track svc._id) {
            <li class="flex justify-between items-baseline text-sm">
              <span class="text-gray-700 dark:text-gray-300 truncate mr-2">{{ svc.name }}</span>
              <span class="text-purple-600 dark:text-purple-400 font-semibold whitespace-nowrap">{{ svc.price | appCurrency }}</span>
            </li>
          }
          @if (salon().services.length > 3) {
            <li class="text-xs text-gray-400 dark:text-gray-500 mt-0.5">+{{ salon().services.length - 3 }} more services</li>
          }
        </ul>
      </div>

      <ng-template #footer>
        <p-button
          label="Book Now"
          icon="pi pi-calendar"
          styleClass="w-full justify-center"
          [disabled]="!salon().isActive || !salon().isApproved"
          (onClick)="onBookNow(); $event.stopPropagation()"
          [attr.aria-label]="'Book an appointment at ' + salon().name"
        />
      </ng-template>
    </p-card>
  `,
  styles: [`
    :host { display: flex; flex-direction: column; height: 100%; cursor: pointer; }

    :host ::ng-deep .salon-card-primeng {
      display: flex;
      flex-direction: column;
      height: 100%;
      transition: box-shadow 0.25s ease, transform 0.25s ease;
    }

    :host ::ng-deep .salon-card-primeng:hover {
      transform: translateY(-3px);
      box-shadow: 0 8px 24px rgba(0,0,0,0.13);
    }

    :host ::ng-deep .salon-card-primeng .p-card-body {
      flex: 1;
      display: flex;
      flex-direction: column;
    }

    :host ::ng-deep .salon-card-primeng .p-card-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      padding-bottom: 0;
    }
  `],
})
export class SalonCardComponent {
  private readonly router = inject(Router);

  readonly salon = input.required<Salon>();

  readonly coverImage = computed(() =>
    this.salon().images?.[0]?.url ?? null,
  );

  readonly topServices = computed<SalonServiceItem[]>(() =>
    this.salon().services.slice(0, 3),
  );

  onCardClick(): void {
    const id = this.salon()._id;
    if (id) void this.router.navigate(['/discover', id]);
  }

  onBookNow(): void {
    const id = this.salon()._id;
    if (id) void this.router.navigate(['/discover', id]);
  }

  onImgError(event: Event): void {
    const el = event.target as HTMLImageElement;
    el.style.display = 'none';
    const parent = el.closest('.relative') as HTMLElement | null;
    if (parent) {
      parent.insertAdjacentHTML(
        'beforeend',
        `<div class="flex items-center justify-center w-full h-full absolute inset-0 text-gray-300" ` +
        `style="background:inherit"><i class="pi pi-image" style="font-size:2.5rem"></i></div>`,
      );
    }
  }
}
