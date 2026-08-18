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
      connectionRetries: 5,
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
      console.log('\n🔑 RENDER UCHUN TELEGRAM_SESSION (Nusxalab oling):');
      console.log('--------------------------------------------------');
      console.log(currentSession);
      console.log('--------------------------------------------------\n');
    }

    this.me = await this.client.getMe();
    console.log(`\n==================================================`);
    console.log(`✅ Telegram akkaunt ulandi: ${this.me.firstName} (@${this.me.username || 'username_yoq'})`);
    console.log(`🆔 ID: ${this.me.id}`);
    console.log(`🤖 AI Status: ${this.memoryManager.isEnabled() ? '🟢 Yoniq' : '🔴 O\'chiq'}`);
    console.log(`📚 Kontekst hajmi: ${this.config.historyLimit} ta xabar`);
    console.log(`==================================================\n`);

    this.registerHandlers();
  }

  private registerHandlers() {
    this.client.addEventHandler(async (event: NewMessageEvent) => {
      const message = event.message;
      if (!message || !message.text) return;

      const senderId = message.senderId ? message.senderId.toString() : '';
      const myId = this.me.id.toString();
      const isFromMe = message.out || senderId === myId;
      const text = message.text.trim();

      // 1. Shaxsiy buyruqlar (Saved Messages yoki o'zingiz yozganingizda)
      if (isFromMe && text.startsWith('.')) {
        await this.handleCommands(message, text);
        return;
      }

      // Faqat shaxsiy chatlar (Lichka / Private) bilan ishlash
      if (!event.isPrivate) return;

      // Agar o'zingiz lichkada birovga qo'lda yozsangiz, AI ushbu chatni 15 minutga o'chiradi
      const chatId = message.chatId ? message.chatId.toString() : senderId;
      if (isFromMe) {
        this.memoryManager.muteChatForManualIntervention(chatId);
        return;
      }

      // Global AI o'chiq bo'lsa
      if (!this.memoryManager.isEnabled()) return;

      // Ushbu chat vaqtinchalik muzlatilgan bo'lsa (siz qo'lda yozganingiz sababli)
      if (this.memoryManager.isChatMuted(chatId)) {
        console.log(`⏳ [Chat ${chatId}] Suhbatda siz faolsiz, AI kutish rejimida.`);
        return;
      }

      // Sender ma'lumotlarini olish
      let senderUser: any = null;
      try {
        senderUser = await message.getSender();
      } catch {
        // Fallback
      }

      const senderUsername = senderUser?.username ? senderUser.username.toLowerCase() : '';
      const senderName = senderUser?.firstName || 'Suhbatdosh';

      // Qora ro'yxatni tekshirish
      if (this.config.blacklistUsers.includes(senderUsername) || this.config.blacklistUsers.includes(senderId)) {
        console.log(`🚫 [Blacklist] @${senderUsername || senderId} qora ro'yxatda, javob berilmadi.`);
        return;
      }

      // Debounce & Xabarlarni yig'ish
      await this.queueAndProcessMessage(chatId, senderName, text, message);
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
          text: `💡 **AI Komandalar:**\n• \`.ai on\` - Yoqish\n• \`.ai off\` - O'chirish\n• \`.ai status\` - Holat\n• \`.ai unmute\` - Joriy chatni faollashtirish`,
        });
      }
    }
  }

  private async queueAndProcessMessage(
    chatId: string,
    senderName: string,
    text: string,
    lastMessage: any
  ) {
    const state = this.memoryManager.getOrCreateChatState(chatId);
    state.pendingMessages.push(text);

    console.log(`📩 [Yangi xabar] ${senderName} (${chatId}): "${text}"`);

    // Agar oldin taymer qo'yilgan bo'lsa, uni bekor qilib yangilaymiz (Debounce)
    if (state.timer) {
      clearTimeout(state.timer);
    }

    state.timer = setTimeout(async () => {
      const messagesToProcess = [...state.pendingMessages];
      state.pendingMessages = [];
      state.timer = undefined;

      await this.executeAIResponse(chatId, senderName, messagesToProcess, lastMessage);
    }, this.config.debounceMs);
  }

  private async executeAIResponse(
    chatId: string,
    senderName: string,
    incomingTexts: string[],
    lastMessage: any
  ) {
    if (incomingTexts.length === 0) return;

    try {
      console.log(`🔍 [Chat ${chatId}] Oxirgi ${this.config.historyLimit} ta xabar o'qilmoqda...`);

      // 1. Oxirgi 50 ta xabarni olish
      const rawMessages = await this.client.getMessages(chatId, {
        limit: this.config.historyLimit,
      });

      const history: ChatMessage[] = rawMessages
        .filter((m) => m.text && m.text.trim().length > 0)
        .map((m) => ({
          id: m.id,
          senderName: m.out ? 'Men' : senderName,
          isMe: Boolean(m.out),
          text: m.text.trim(),
          date: new Date(m.date * 1000),
        }))
        .reverse(); // Eng eskisidan yangisiga qarab xronologik tartib

      // 2. Typing ko'rsatish
      if (this.config.simulateTyping) {
        try {
          const entity = await this.client.getEntity(chatId);
          await this.client.invoke(
            new Api.messages.SetTyping({
              peer: entity,
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

      // Real odamdek ko'rinishi uchun kichik kechikish (1.5 - 2.5 soniya)
      const delayMs = Math.min(Math.max(aiReply.length * 40, 1500), 3500);
      await new Promise((r) => setTimeout(r, delayMs));

      // 3. Javobni yuborish
      await this.client.sendMessage(chatId, { message: aiReply });
      console.log(`📤 [Yuborildi] ${senderName} ga: "${aiReply}"\n`);
    } catch (error: any) {
      console.error(`❌ [Xatolik - Chat ${chatId}]:`, error?.message || error);
    }
  }
}
