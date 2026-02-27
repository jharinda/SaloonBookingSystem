import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';

/**
 * Temporary home-page component.
 * Self-contained: includes its own nav, hero and inline styles.
 * No external libraries — swap out once the full feature libs are ready.
 */
@Component({
  selector: 'app-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <!-- ── Navbar ── -->
    <header style="
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 32px;
      height: 64px;
      background: #ffffff;
      border-bottom: 1px solid #e5e7eb;
      position: sticky;
      top: 0;
      z-index: 100;
    ">
      <span style="font-size: 1.25rem; font-weight: 800; color: #1f2937;
                   letter-spacing: -0.5px; display: flex; align-items: center; gap: 8px;">
        ✂️ SnapSalon
      </span>

      <div style="display: flex; gap: 12px; align-items: center;">
        <a routerLink="/auth/login" style="
          padding: 8px 20px;
          border: 1.5px solid #6750a4;
          border-radius: 24px;
          color: #6750a4;
          font-weight: 600;
          font-size: 0.875rem;
          text-decoration: none;
          background: transparent;
          cursor: pointer;
          transition: background 0.2s;
        ">Log in</a>

        <a routerLink="/auth/register" style="
          padding: 8px 20px;
          border: 1.5px solid #6750a4;
          border-radius: 24px;
          color: #ffffff;
          font-weight: 600;
          font-size: 0.875rem;
          text-decoration: none;
          background: #6750a4;
          cursor: pointer;
        ">Register</a>
      </div>
    </header>

    <!-- ── Hero ── -->
    <section style="
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: calc(100vh - 64px);
      padding: 48px 24px;
      text-align: center;
      background: linear-gradient(160deg, #f5f3ff 0%, #ede9fe 50%, #fce7f3 100%);
    ">
      <!-- Badge -->
      <span style="
        display: inline-block;
        background: #ede9fe;
        color: #6750a4;
        font-size: 0.75rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        padding: 4px 14px;
        border-radius: 20px;
        margin-bottom: 24px;
      ">Now live in Sri Lanka</span>

      <!-- Heading -->
      <h1 style="
        font-size: clamp(2rem, 5vw, 3.5rem);
        font-weight: 900;
        color: #1f2937;
        line-height: 1.15;
        max-width: 720px;
        margin: 0 0 20px;
      ">Sri Lanka's First Online<br />Salon Booking Platform</h1>

      <!-- Subheading -->
      <p style="
        font-size: clamp(1rem, 2.5vw, 1.25rem);
        color: #4b5563;
        max-width: 520px;
        line-height: 1.6;
        margin: 0 0 40px;
      ">Book your next haircut, colour or treatment in seconds</p>

      <!-- CTA -->
      <button
        (click)="findSalon()"
        style="
          padding: 16px 40px;
          background: #6750a4;
          color: #ffffff;
          border: none;
          border-radius: 32px;
          font-size: 1.05rem;
          font-weight: 700;
          cursor: pointer;
          box-shadow: 0 4px 20px rgba(103, 80, 164, 0.35);
          transition: transform 0.15s, box-shadow 0.15s;
        "
        (mouseenter)="hovered.set(true)"
        (mouseleave)="hovered.set(false)"
        [style.transform]="hovered() ? 'translateY(-2px)' : 'translateY(0)'"
        [style.box-shadow]="hovered()
          ? '0 8px 28px rgba(103,80,164,0.45)'
          : '0 4px 20px rgba(103,80,164,0.35)'"
      >Find a Salon →</button>

      <!-- Trust strip -->
      <p style="margin-top: 32px; color: #9ca3af; font-size: 0.825rem;">
        Free to use &nbsp;·&nbsp; No account needed to browse &nbsp;·&nbsp; Instant confirmation
      </p>
    </section>
  `,
})
export class HomeComponent {
  protected readonly router  = inject(Router);
  protected readonly hovered = signal(false);

  findSalon(): void {
    this.router.navigate(['/discover']);
  }
}
