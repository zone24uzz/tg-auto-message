import { ChatStateModel, SettingModel } from './db.js';

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

  constructor() {
    // DB dan holatni yuklash index.ts da initDB chaqirilganda boshlanadi
    // Bu yerda faqat asosiy holat turadi
  }

  public async initFromDB() {
    try {
      const globalEnabledSetting = await SettingModel.findOne({ key: 'isGlobalEnabled' });
      if (globalEnabledSetting) {
        this.isGlobalEnabled = globalEnabledSetting.value;
      }

      const chats = await ChatStateModel.find({});
      for (const chat of chats) {
        if (chat.isMuted) {
          const state = this.getOrCreateChatState(chat.chatId);
          state.isMuted = true;
          if (chat.mutedUntil) {
            state.mutedUntil = new Date(chat.mutedUntil);
          }
        }
      }
      console.log(`🧠 [Memory] ${chats.length} ta chat holati DB dan yuklandi.`);
    } catch (error) {
      console.error('MemoryManager initFromDB xatoligi:', error);
    }
  }

  public isEnabled(): boolean {
    return this.isGlobalEnabled;
  }

  public setEnabled(enabled: boolean) {
    this.isGlobalEnabled = enabled;
    SettingModel.findOneAndUpdate(
      { key: 'isGlobalEnabled' },
      { value: enabled },
      { upsert: true }
    ).catch(err => console.error('DB isGlobalEnabled xato:', err));
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

  public muteChat(chatId: string, durationMinutes: number | null = 10) {
    const state = this.getOrCreateChatState(chatId);
    state.isMuted = true;
    
    if (durationMinutes === null) {
      state.mutedUntil = undefined;
      console.log(`🔇 [Chat ${chatId}] AI cheksiz vaqtga to'xtatildi.`);
    } else {
      state.mutedUntil = new Date(Date.now() + durationMinutes * 60 * 1000);
      console.log(`🔇 [Chat ${chatId}] AI ${durationMinutes} daqiqaga to'xtatildi.`);
    }

    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = undefined;
    }
    state.pendingMessages = [];

    // Saqlash
    this.saveChatState(chatId, state);
  }

  public isChatMuted(chatId: string): boolean {
    const state = this.chatStates.get(chatId);
    if (!state || !state.isMuted) return false;

    if (state.mutedUntil && state.mutedUntil.getTime() < Date.now()) {
      state.isMuted = false;
      state.mutedUntil = undefined;
      this.saveChatState(chatId, state); // muddati tugasa saqlaymiz
      return false;
    }
    return true;
  }

  public getChatState(chatId: string): ChatState | undefined {
    return this.chatStates.get(chatId);
  }

  public adjustMuteTime(chatId: string, minutes: number) {
    const state = this.chatStates.get(chatId);
    if (!state || !state.isMuted) return;

    if (state.mutedUntil) {
      state.mutedUntil = new Date(state.mutedUntil.getTime() + minutes * 60 * 1000);
      if (state.mutedUntil.getTime() <= Date.now()) {
        this.unmuteChat(chatId);
      } else {
        this.saveChatState(chatId, state);
      }
    }
  }

  public unmuteChat(chatId: string) {
    const state = this.chatStates.get(chatId);
    if (state) {
      state.isMuted = false;
      state.mutedUntil = undefined;
      console.log(`🔊 [Chat ${chatId}] AI qayta faollashtirildi.`);
      this.saveChatState(chatId, state);
    }
  }

  public getMutedChats(): string[] {
    const muted: string[] = [];
    for (const [chatId, state] of this.chatStates.entries()) {
      if (this.isChatMuted(chatId)) {
        muted.push(chatId);
      }
    }
    return muted;
  }

  private saveChatState(chatId: string, state: ChatState) {
    ChatStateModel.findOneAndUpdate(
      { chatId },
      { 
        isMuted: state.isMuted, 
        mutedUntil: state.mutedUntil 
      },
      { upsert: true }
    ).catch(err => console.error(`ChatState saqlashda xato (${chatId}):`, err));
  }
}
