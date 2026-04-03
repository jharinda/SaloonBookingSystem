import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of, tap } from 'rxjs';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class FavoritesService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);

  private readonly _favorites = signal<Set<string>>(new Set());

  /** Read-only reactive set of saved salon IDs. */
  readonly favorites = this._favorites.asReadonly();

  /** Returns true if the given salonId is in the favorites set. */
  isFavorite(salonId: string): boolean {
    return this._favorites().has(salonId);
  }

  /**
   * Load favorite salon IDs from the backend.
   * Safe to call even when the user is not authenticated — returns immediately.
   */
  loadFavorites(): Observable<void> {
    if (!this.authService.isLoggedIn()) {
      return of(void 0);
    }
    return this.http.get<string[]>('/api/users/me/favorites').pipe(
      tap((ids) => this._favorites.set(new Set(ids))),
      map(() => void 0),
      catchError(() => of(void 0)),
    );
  }

  /**
   * Optimistically toggle the saved state for a salon.
   * Reverts the local state if the API call fails.
   */
  toggle(salonId: string): void {
    const wasFav = this.isFavorite(salonId);

    // Optimistic update
    this._favorites.update((s) => {
      const next = new Set(s);
      if (wasFav) {
        next.delete(salonId);
      } else {
        next.add(salonId);
      }
      return next;
    });

    const req$ = wasFav
      ? this.http.delete<{ favoriteSalonIds: string[] }>(`/api/users/me/favorites/${salonId}`)
      : this.http.post<{ favoriteSalonIds: string[] }>(`/api/users/me/favorites/${salonId}`, {});

    req$.subscribe({
      next: (res) => this._favorites.set(new Set(res.favoriteSalonIds)),
      error: () => {
        // Revert on failure
        this._favorites.update((s) => {
          const next = new Set(s);
          if (wasFav) {
            next.add(salonId);
          } else {
            next.delete(salonId);
          }
          return next;
        });
      },
    });
  }

  /** Clear all favorites (e.g. on logout). */
  clear(): void {
    this._favorites.set(new Set());
  }
}
