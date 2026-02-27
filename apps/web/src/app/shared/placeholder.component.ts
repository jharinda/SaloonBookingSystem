import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

/** Reusable placeholder shown for features not yet implemented. */
@Component({
  selector: 'app-placeholder',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <div class="placeholder">
      <div class="placeholder__icon">🚧</div>
      <h2 class="placeholder__title">{{ title() }}</h2>
      <p class="placeholder__sub">This feature is coming soon.</p>
      <a routerLink="/discover" class="placeholder__btn">Back to Discover</a>
    </div>
  `,
  styles: [`
    .placeholder {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 60vh;
      gap: 16px;
      text-align: center;
      color: #374151;
    }
    .placeholder__icon { font-size: 3rem; }
    .placeholder__title { font-size: 1.6rem; font-weight: 700; margin: 0; }
    .placeholder__sub { color: #6b7280; margin: 0; }
    .placeholder__btn {
      margin-top: 8px;
      padding: 10px 24px;
      background: #6750A4;
      color: #fff;
      border-radius: 24px;
      text-decoration: none;
      font-weight: 600;
      font-size: 0.9rem;
    }
  `],
})
export class PlaceholderComponent {
  readonly title = input<string>('Coming Soon');
}
