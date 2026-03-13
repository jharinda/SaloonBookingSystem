import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { Observable } from 'rxjs';
import { AuthService } from '@org/shared-data-access';

@Injectable({
  providedIn: 'root'
})
export class SocketService {
  private socket: Socket | null = null;
  private socketUrl: string;

  constructor(private authService: AuthService) {
    // Auto-detect socket URL based on current origin
    // In dev: uses current origin (works with dev tunnel)
    // In prod: should be configured to actual chat service URL
    if (typeof window !== 'undefined') {
      this.socketUrl = window.location.origin;
    } else {
      this.socketUrl = 'http://localhost:3009'; // Fallback for SSR
    }
  }

  setSocketUrl(url: string): void {
    this.socketUrl = url;
  }

  connect(): void {
    // Guard: if socket exists at all (connected OR connecting), do not create another
    if (this.socket !== null) {
      if (!this.socket.connected) {
        this.socket.connect(); // reconnect existing socket instead of creating new one
      }
      return;
    }

    // Get JWT from in-memory AuthService — never localStorage (XSS risk)
    const token = this.authService.getAccessToken();

    this.socket = io(`${this.socketUrl}/chat`, { // Connect to /chat namespace
      auth: {
        token: token || ''
      },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5
    });

    this.socket.on('connect', () => {
      console.log('✅ Socket.io connected to /chat namespace');
    });

    this.socket.on('disconnect', (reason) => {
      console.warn('⚠️ Socket.io disconnected:', reason);
      if (reason === 'io server disconnect') {
        // Server disconnected the socket, reconnect manually
        this.socket?.connect();
      }
    });

    this.socket.on('connect_error', (error) => {
      console.error('❌ Socket.io connection error:', error);
    });

    this.socket.on('error', (error) => {
      console.error('❌ Socket.io error:', error);
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  emit(event: string, data: unknown): void {
    if (!this.socket?.connected) {
      console.warn('Socket not connected. Attempting to connect...');
      this.connect();
    }
    this.socket?.emit(event, data);
  }

  fromEvent<T>(event: string): Observable<T> {
    if (!this.socket) {
      this.connect();
    }
    return new Observable<T>((observer) => {
      // Create a specific handler function so we can remove only THIS listener
      const handler = (data: T) => {
        observer.next(data);
      };

      this.socket?.on(event, handler);

      return () => {
        // Remove only this specific handler, not all handlers for this event
        this.socket?.off(event, handler);
      };
    });
  }

  isConnected(): boolean {
    return this.socket?.connected || false;
  }
}
