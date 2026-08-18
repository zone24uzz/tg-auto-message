export interface ChatState {
  chatId: string;
  isMuted: boolean;
  mutedUntil?: Date;
  pendingMessages: string[];
  timer?: NodeJS.Timeout;
}

export class MemoryManager {
  private isGlobalEnabled: boolean = true;
  private chatStates: Map<string, ChatState> = new Map();
  private userMuteDurationMinutes: number = 15; // Manual yozganda AI 15 minutga o'chadi

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

  public muteChatForManualIntervention(chatId: string) {
    const state = this.getOrCreateChatState(chatId);
    const until = new Date(Date.now() + this.userMuteDurationMinutes * 60 * 1000);
    state.isMuted = true;
    state.mutedUntil = until;
    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = undefined;
    }
    state.pendingMessages = [];
    console.log(`🔇 [Chat ${chatId}] Siz o'zingiz yozdingiz. AI ushbu chatda ${this.userMuteDurationMinutes} daqiqaga to'xtatildi.`);
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
    }
  }
}
