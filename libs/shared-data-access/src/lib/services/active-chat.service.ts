import { Injectable, signal } from '@angular/core';

/**
 * Service to track which chat conversation the user is currently viewing.
 * Used to prevent notifications for messages in the active conversation.
 */
@Injectable({ providedIn: 'root' })
export class ActiveChatService {
  /**
   * The ID of the conversation currently being viewed by the user.
   * Null if user is not viewing any conversation.
   */
  private readonly _activeConversationId = signal<string | null>(null);

  /** Read-only signal for the active conversation ID */
  readonly activeConversationId = this._activeConversationId.asReadonly();

  /** Set the currently active conversation ID */
  setActiveConversation(conversationId: string | null): void {
    console.log('🎯 ActiveChatService: Setting active conversation:', conversationId);
    this._activeConversationId.set(conversationId);
  }

  /** Check if a conversation is currently active */
  isConversationActive(conversationId: string): boolean {
    const active = this._activeConversationId();
    const isActive = active === conversationId;
    console.log('🔍 ActiveChatService: Checking if conversation is active:', { conversationId, active, isActive });
    return isActive;
  }

  /** Clear the active conversation (when leaving chat page) */
  clearActiveConversation(): void {
    console.log('🧹 ActiveChatService: Clearing active conversation');
    this._activeConversationId.set(null);
  }
}
