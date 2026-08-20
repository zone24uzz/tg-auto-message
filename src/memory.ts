export interface ChatState {
  chatId: string;
  isMuted: boolean;
  mutedUntil?: Date;
  pendingMessages: string[];
  timer?: NodeJS.Timeout;
  onlineCheckTimer?: NodeJS.Timeout;
  messageTimestamps?: number[];
}

export class MemoryManager {
  private isGlobalEnabled: boolean = true;
  private chatStates: Map<string, ChatState> = new Map();

  public isEnabled(): boolean {
    return this.isGlobalEnabled;
  }

  public setEnabled(enabled: boolean) {
    this.isGlobalEnabled = enabled;
  }

  public getOrCreateChatState(chatId: string): ChatState {
    let state = this.chatStates.get(chatId);
    if (!state) {
      state = {
        chatId,
        isMuted: false,
        pendingMessages: [],
      };
      this.chatStates.set(chatId, state);
    }
    return state;
  }

  public muteChat(chatId: string, durationMinutes: number = 10) {
    const state = this.getOrCreateChatState(chatId);
    state.isMuted = true;
    state.mutedUntil = new Date(Date.now() + durationMinutes * 60 * 1000);
    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = undefined;
    }
    state.pendingMessages = [];
    console.log(`🔇 [Chat ${chatId}] AI ${durationMinutes} daqiqaga to'xtatildi.`);
  }

  public isChatMuted(chatId: string): boolean {
    const state = this.chatStates.get(chatId);
    if (!state || !state.isMuted) return false;

    if (state.mutedUntil && state.mutedUntil.getTime() < Date.now()) {
      state.isMuted = false;
      state.mutedUntil = undefined;
      return false;
    }
    return true;
  }

  public unmuteChat(chatId: string) {
    const state = this.chatStates.get(chatId);
    if (state) {
      state.isMuted = false;
      state.mutedUntil = undefined;
      console.log(`🔊 [Chat ${chatId}] AI qayta faollashtirildi.`);
    }
  }
}
