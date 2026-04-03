import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { EMPTY } from 'rxjs';
import { signal } from '@angular/core';
import { vi } from 'vitest';

import { ChatComponent } from './chat';
import { SocketService } from '@org/shared/socket';
import { AuthService, ChatService, ActiveChatService } from '@org/shared-data-access';

describe('ChatComponent', () => {
  let component: ChatComponent;
  let fixture: ComponentFixture<ChatComponent>;

  beforeEach(async () => {
    const mockSocketService = {
      isConnected: vi.fn().mockReturnValue(false),
      fromEvent: vi.fn().mockReturnValue(EMPTY),
      emit: vi.fn(),
      connect: vi.fn(),
      disconnect: vi.fn(),
    };

    const mockChatService = {
      getConversations: vi.fn().mockReturnValue(EMPTY),
      getMessages: vi.fn().mockReturnValue(EMPTY),
      sendMessage: vi.fn().mockReturnValue(EMPTY),
      markAsRead: vi.fn().mockReturnValue(EMPTY),
      startConversation: vi.fn().mockReturnValue(EMPTY),
    };

    const mockAuthService = {
      currentUser: signal<null>(null),
      getAccessToken: vi.fn().mockReturnValue(null),
      isAuthenticated: vi.fn().mockReturnValue(false),
    };

    const mockActiveChatService = {
      activeConversationId: signal<string | null>(null),
      setActiveConversation: vi.fn(),
      clearActiveConversation: vi.fn(),
      isConversationActive: vi.fn().mockReturnValue(false),
    };

    await TestBed.configureTestingModule({
      imports: [ChatComponent],
      providers: [
        provideRouter([]),
        { provide: SocketService, useValue: mockSocketService },
        { provide: ChatService, useValue: mockChatService },
        { provide: AuthService, useValue: mockAuthService },
        { provide: ActiveChatService, useValue: mockActiveChatService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ChatComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
