import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class SocketService {
  private socket: Socket | null = null;
  private socketUrl = 'http://localhost:3000';

  setSocketUrl(url: string): void {
    this.socketUrl = url;
  }

  connect(): void {
    if (this.socket?.connected) {
      return;
    }

    // Get JWT token from localStorage
    const token = localStorage.getItem('access_token');

    this.socket = io(this.socketUrl, {
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
      console.log('✅ Socket.io connected');
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
      this.socket?.on(event, (data: T) => {
        observer.next(data);
      });

      return () => {
        this.socket?.off(event);
      };
    });
  }

  isConnected(): boolean {
    return this.socket?.connected || false;
  }
}
