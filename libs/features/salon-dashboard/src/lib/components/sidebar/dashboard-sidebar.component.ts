import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { Button } from 'primeng/button';
import { Tooltip } from 'primeng/tooltip';

@Component({
  selector: 'lib-dashboard-sidebar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    RouterLinkActive,
    Button,
    Tooltip,
  ],
  templateUrl: './dashboard-sidebar.component.html',
  styles: [`
    :host {
      display: block;
    }

    .nav-icon-btn {
      display: flex;
      align-items: center;
      justify-content: flex-start;
      height: 2.5rem;
      border-radius: 10px;
      color: #52525b;
      cursor: pointer;
      transition: all 0.2s ease;
      text-decoration: none;

      i { font-size: 1.1rem; }

      &:hover {
        background: rgba(0, 0, 0, 0.05);
        color: #18181b;
      }
    }

    :host-context(.app-dark) .nav-icon-btn {
      color: #71717a;

      &:hover {
        background: rgba(255, 255, 255, 0.08);
        color: #fff;
      }
    }

    :host ::ng-deep .active-nav-item {
      background: rgba(16, 185, 129, 0.15) !important;
      color: #10b981 !important;

      i { color: #10b981; }
    }

    @media (max-width: 768px) {
      aside { display: none; }
      main { margin-left: 0 !important; }
    }
  `],
})
export class DashboardSidebarComponent {
  readonly salonName   = input<string | null>(null);
  readonly userEmail   = input<string>('');
  readonly isExpanded  = input<boolean>(false);

  readonly expanded      = output<void>();
  readonly collapsed     = output<void>();
  readonly logoutClicked = output<void>();

  logout(): void {
    this.logoutClicked.emit();
  }
}
