import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { NewMessage, NewMessageEvent } from 'telegram/events/index.js';
import input from 'input';
import fs from 'fs';
import path from 'path';
import { Config } from './config.js';
import { AIService, ChatMessage } from './ai.js';
import { MemoryManager } from './memory.js';

export class TelegramService {
  private client!: TelegramClient;
  private config: Config;
  private aiService: AIService;
  private memoryManager: MemoryManager;
  private me: any = null;
  private sessionFile: string;

  constructor(config: Config) {
    this.config = config;
    this.sessionFile = path.resolve(process.cwd(), '.session');
    this.memoryManager = new MemoryManager();
    this.aiService = new AIService(
      config.geminiApiKey,
      config.geminiModel,
      config.systemPrompt
    );
  }

  private loadSessionString(): string {
    if (this.config.sessionString && this.config.sessionString.trim().length > 0) {
      return this.config.sessionString.trim();
    }
    if (fs.existsSync(this.sessionFile)) {
      try {
        return fs.readFileSync(this.sessionFile, 'utf-8').trim();
      } catch (e) {
        console.warn('⚠️ Session faylni o\'qishda xatolik:', e);
      }
    }
    return '';
  }

  private saveSessionString(sessionStr: string) {
    try {
      fs.writeFileSync(this.sessionFile, sessionStr, 'utf-8');
      console.log('💾 Telegram Session muvaffaqiyatli .session fayliga saqlandi!');
    } catch (e) {
      console.error('❌ Sessionni saqlashda xatolik:', e);
    }
  }

  public async start() {
    const savedSession = this.loadSessionString();
    const stringSession = new StringSession(savedSession);

    console.log('🚀 Telegram Client ishga tushirilmoqda...');
    this.client = new TelegramClient(stringSession, this.config.apiId, this.config.apiHash, {
      connectionRetries: 15,
      autoReconnect: true,
    });

    await this.client.start({
      phoneNumber: async () => await input.text('📱 Telefon raqamingizni kiriting (+998...): '),
      password: async () => await input.password('🔐 2-bosqichli parolingiz (2FA bo\'lsa): '),
      phoneCode: async () => await input.text('✉️ Telegramdan kelgan tasdiqlash kodini kiriting: '),
      onError: (err) => console.error('❌ Telegram auth xatosi:', err),
    });

    const currentSession = this.client.session.save() as unknown as string;
    if (currentSession) {
      this.saveSessionString(currentSession);
    }

    this.me = await this.client.getMe();
    console.log(`\n==================================================`);
    console.log(`✅ Telegram akkaunt ulandi: ${this.me.firstName} (@${this.me.username || 'username_yoq'})`);
    console.log(`🆔 ID: ${this.me.id}`);
    console.log(`🤖 AI Status: 🟢 Yoniq`);
    console.log(`📚 Kontekst hajmi: ${this.config.historyLimit} ta xabar`);
    console.log(`==================================================\n`);

    this.registerHandlers();
  }

  private registerHandlers() {
    this.client.addEventHandler(async (event: NewMessageEvent) => {
      try {
        const message = event.message;
        if (!message) return;

        const text = (message.text || '').trim();
        const senderId = message.senderId ? message.senderId.toString() : '';
        const myId = this.me ? this.me.id.toString() : '';
        const isFromMe = Boolean(message.out) || senderId === myId;

        // 1. Shaxsiy buyruqlar (.ai on/off/status)
        if (isFromMe) {
          if (text.startsWith('.')) {
            await this.handleCommands(message, text);
          }
          return;
        }

        // Faqat shaxsiy lichka (DM) - Guruh va kanallarni tashlab ketamiz
        const isGroupOrChannel = message.isGroup || message.isChannel || event.isGroup || event.isChannel;
        if (isGroupOrChannel) return;

        const chatId = message.chatId ? message.chatId.toString() : senderId;
        if (!chatId) return;

        // Global AI o'chiq bo'lsa
        if (!this.memoryManager.isEnabled()) {
          console.log(`⏸️ [Chat ${chatId}] AI global o'chiq.`);
          return;
        }

        let senderName = 'Suhbatdosh';
        try {
          const senderUser: any = await message.getSender();
          if (senderUser?.firstName) {
            senderName = senderUser.firstName;
          }
          const senderUsername = senderUser?.username ? senderUser.username.toLowerCase() : '';
          if (this.config.blacklistUsers.includes(senderUsername) || this.config.blacklistUsers.includes(senderId)) {
            console.log(`🚫 [Blacklist] @${senderUsername || senderId} qora ro'yxatda.`);
            return;
          }
        } catch {
          // Non-fatal
        }

        if (!text) return;

        console.log(`📩 [Kelgan xabar] ${senderName} (${chatId}): "${text}"`);
        await this.queueAndProcessMessage(chatId, senderName, text, message);
      } catch (handlerErr: any) {
        console.error('❌ Event Handler xatoligi:', handlerErr?.message || handlerErr);
      }
    }, new NewMessage({}));
  }

  private async handleCommands(message: any, text: string) {
    const parts = text.split(' ');
    const cmd = parts[0].toLowerCase();

    if (cmd === '.ai') {
      const subCmd = parts[1]?.toLowerCase();
      if (subCmd === 'on') {
        this.memoryManager.setEnabled(true);
        await message.edit({ text: '🟢 **AI Auto-Responder yoqildi!**' });
      } else if (subCmd === 'off') {
        this.memoryManager.setEnabled(false);
        await message.edit({ text: '🔴 **AI Auto-Responder o\'chirildi!**' });
      } else if (subCmd === 'status') {
        const status = this.memoryManager.isEnabled() ? '🟢 Yoniq' : '🔴 O\'chiq';
        await message.edit({
          text: `📊 **AI Holati:** ${status}\nModel: \`${this.config.geminiModel}\`\nKontekst: \`${this.config.historyLimit} ta xabar\``,
        });
      } else if (subCmd === 'unmute' && message.chatId) {
        this.memoryManager.unmuteChat(message.chatId.toString());
        await message.edit({ text: '⚡ **Ushbu chatda AI qayta faollashtirildi.**' });
      } else {
        await message.edit({
          text: `💡 **AI Komandalar:**\n• \`.ai on\` - Yoqish\n• \`.ai off\` - O'chirish\n• \`.ai status\` - Holat\n• \`.ai unmute\` - Chatni ochish`,
        });
      }
    }
  }

  private async queueAndProcessMessage(
    chatId: string,
    senderName: string,
    text: string,
    rawMsg: any
  ) {
    const state = this.memoryManager.getOrCreateChatState(chatId);
    state.pendingMessages.push(text);

    if (state.timer) {
      clearTimeout(state.timer);
    }

    state.timer = setTimeout(async () => {
      const messagesToProcess = [...state.pendingMessages];
      state.pendingMessages = [];
      state.timer = undefined;

      await this.executeAIResponse(chatId, senderName, messagesToProcess, rawMsg);
    }, 2000); // 2 soniya debounce
  }

  private async executeAIResponse(
    chatId: string,
    senderName: string,
    incomingTexts: string[],
    rawMsg: any
  ) {
    if (incomingTexts.length === 0) return;

    try {
      console.log(`🔍 [Chat ${chatId}] Tarix o'qilmoqda...`);

      // 1. Oxirgi 50 ta xabarni olish (xatolik bo'lsa ham dastur to'xtamaydi)
      const history: ChatMessage[] = [];
      try {
        const rawMessages = await this.client.getMessages(rawMsg.peerId || chatId, {
          limit: this.config.historyLimit,
        });

        for (const m of rawMessages) {
          const textContent = m.text ? m.text.trim() : '';
          if (textContent) {
            history.push({
              id: m.id,
              senderName: m.out ? 'Men' : senderName,
              isMe: Boolean(m.out),
              text: textContent,
              date: new Date(m.date * 1000),
            });
          }
        }
        history.reverse();
      } catch (histErr: any) {
        console.warn(`⚠️ [Tarix olishda ogohlantirish]: ${histErr?.message}`);
      }

      // 2. Typing ko'rsatish
      if (this.config.simulateTyping) {
        try {
          await this.client.invoke(
            new Api.messages.SetTyping({
              peer: rawMsg.peerId || (await this.client.getInputEntity(chatId)),
              action: new Api.SendMessageTypingAction(),
            })
          );
        } catch {
          // Non-fatal
        }
      }

      console.log(`🧠 [AI] Gemini orqali javob generatsiya qilinmoqda...`);
      const aiReply = await this.aiService.generateResponse(senderName, history, incomingTexts);

      if (!aiReply || aiReply.trim().length === 0) {
        console.warn('⚠️ Bo\'sh javob qaytdi.');
        return;
      }

      // Kichik insoniy kutish
      await new Promise((r) => setTimeout(r, 1200));

      // 3. Javobni yuborish (bir necha usulda urinish)
      try {
        await this.client.sendMessage(rawMsg.peerId || chatId, { message: aiReply });
      } catch {
        const inputPeer = await this.client.getInputEntity(chatId);
        await this.client.sendMessage(inputPeer, { message: aiReply });
      }

      console.log(`📤 [Muvaffaqiyatli Yuborildi] ${senderName} ga: "${aiReply}"\n`);
    } catch (error: any) {
      console.error(`❌ [Xatolik - Chat ${chatId}]:`, error?.message || error);
    }
  }
}
