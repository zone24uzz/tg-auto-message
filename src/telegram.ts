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

  public getMemoryManager(): MemoryManager {
    return this.memoryManager;
  }

  public getMeId(): string {
    return this.me ? this.me.id.toString() : '';
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
    if (!savedSession) {
      stringSession.setDC(4, "149.154.167.51", 443);
    }

    console.log('🚀 Telegram Client ishga tushirilmoqda...');
    this.client = new TelegramClient(stringSession, this.config.apiId, this.config.apiHash, {
      connectionRetries: 15,
      autoReconnect: true,
      useWSS: true,
    });

    console.log('📱 Session tekshirilmoqda. Agar eskirgan bo\'lsa yangi login talab qilinadi...');
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
    console.log(`✅ Telegram akkaunt muvaffaqiyatli ulandi!`);
    console.log(`👤 Foydalanuvchi: ${this.me.firstName} (@${this.me.username || 'username_yoq'})`);
    console.log(`🆔 ID: ${this.me.id}`);
    console.log(`🤖 AI Status: 🟢 DOIMIY FAOL`);
    console.log(`📚 Kontekst hajmi: ${this.config.historyLimit} ta xabar`);
    console.log(`==================================================\n`);

    this.registerHandlers();
  }

  private registerHandlers() {
    this.client.addEventHandler(async (event: NewMessageEvent) => {
      try {
        const message = event.message;
        if (!message) return;

        const text = (message.text || message.message || '').trim();
        const senderId = message.senderId ? message.senderId.toString() : '';
        const myId = this.me ? this.me.id.toString() : '';
        const isFromMe = Boolean(message.out) || senderId === myId;
        const chatId = message.chatId ? message.chatId.toString() : senderId;

        if (isFromMe) {
          if (text.startsWith('.')) {
            await this.handleCommands(message, text);
          } else if (chatId) {
            console.log(`⏸️ [Chat ${chatId}] Egasi o'zi yozdi. Chat 15 daqiqaga muzlatildi.`);
            this.memoryManager.muteChat(chatId, 15);
          }
          return;
        }

        // Faqat shaxsiy yozishmalar (Lichka / DM)
        if (message.isGroup || message.isChannel) {
          return;
        }

        if (!chatId) return;

        // Global AI o'chiq bo'lsa
        if (!this.memoryManager.isEnabled()) {
          console.log(`⏸️ [Chat ${chatId}] AI global o'chiq.`);
          return;
        }

        if (this.memoryManager.isChatMuted(chatId)) {
          console.log(`⏳ [Chat ${chatId}] Chat vaqtinchalik muzlatilgan.`);
          return;
        }

        let senderName = 'Suhbatdosh';
        try {
          const senderUser: any = await message.getSender();
          if (senderUser?.firstName) {
            senderName = senderUser.firstName;
          }
        } catch {
          // Non-fatal
        }


        if (!text && !message.media) return;

        let messageText = text;
        if (message.media && (message.media as any).document?.attributes) {
          for (const attr of (message.media as any).document.attributes) {
            if (attr.className === 'DocumentAttributeSticker') {
              messageText = text ? `${text} [Sticker: ${attr.alt || ''}]` : `[Sticker: ${attr.alt || ''}]`;
            }
          }
        }

        console.log(`📩 [Yangi Xabar] ${senderName} (${chatId}): "${messageText || '[Media Fayl]'}"`);
        await this.queueAndProcessMessage(chatId, senderName, messageText || '[Media Fayl]', message);
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
    
    // Spam detection logic (e.g. 7 messages in 30 seconds)
    if (!state.messageTimestamps) state.messageTimestamps = [];
    const now = Date.now();
    state.messageTimestamps.push(now);
    state.messageTimestamps = state.messageTimestamps.filter(t => now - t < 30000);
    
    if (state.messageTimestamps.length > 7) {
      console.log(`🚫 [Chat ${chatId}] Spam aniqlandi! 30 daqiqaga bloklanmoqda.`);
      this.memoryManager.muteChat(chatId, 30);
      return;
    }

    state.pendingMessages.push(text);

    if (state.timer) {
      clearTimeout(state.timer);
    }

    state.timer = setTimeout(async () => {
      state.timer = undefined;
      await this.tryProcessMessages(chatId, senderName, rawMsg);
    }, 1500); // 1.5 soniya debounce
  }

  private async tryProcessMessages(chatId: string, senderName: string, rawMsg: any) {
    const state = this.memoryManager.getOrCreateChatState(chatId);
    
    // Check if I am online
    let isOwnerOnline = false;
    try {
      const me: any = await this.client.getEntity('me');
      if (me.status?.className === 'UserStatusOnline') {
        isOwnerOnline = true;
      }
    } catch (e) {
      console.warn("Egasi statusini olishda xatolik:", e);
    }

    if (isOwnerOnline) {
      if (!state.onlineCheckTimer) {
        console.log(`⏳ [Chat ${chatId}] Egasi onlayn. 30 soniyadan keyin qayta tekshiriladi...`);
        state.onlineCheckTimer = setTimeout(() => {
          state.onlineCheckTimer = undefined;
          this.tryProcessMessages(chatId, senderName, rawMsg);
        }, 30000); // 30 soniyada tekshirish
      }
      return;
    }

    const messagesToProcess = [...state.pendingMessages];
    if (messagesToProcess.length === 0) return;
    if (this.memoryManager.isChatMuted(chatId)) return;
    
    state.pendingMessages = [];

    await this.executeAIResponse(chatId, senderName, messagesToProcess, rawMsg);
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

      // 1. Oxirgi 50 ta xabarni olish
      const history: ChatMessage[] = [];
      try {
        const rawMessages = await this.client.getMessages(rawMsg.peerId || chatId, {
          limit: this.config.historyLimit,
        });

        for (const m of rawMessages) {
          let textContent = (m.text || m.message || '').trim();
          if (m.media && (m.media as any).document?.attributes) {
            for (const attr of (m.media as any).document.attributes) {
              if (attr.className === 'DocumentAttributeSticker') {
                textContent = textContent ? `${textContent} [Sticker: ${attr.alt || ''}]` : `[Sticker: ${attr.alt || ''}]`;
              }
            }
          }
          if (textContent || m.media) {
            history.push({
              id: m.id,
              senderName: m.out ? 'Men' : senderName,
              isMe: Boolean(m.out),
              text: textContent || '[Media Fayl]',
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
      
      const mediaParts: any[] = [];
      if (rawMsg.media) {
        try {
          console.log(`📥 [Chat ${chatId}] Media fayl yuklanmoqda...`);
          const fileSize = rawMsg.file?.size || 0;
          if (fileSize < 15 * 1024 * 1024) {
            const downloaded = await this.client.downloadMedia(rawMsg);
            if (downloaded) {
              // downloadMedia Buffer yoki string qaytarishi mumkin
              const buf = Buffer.isBuffer(downloaded) ? downloaded : Buffer.from(downloaded as any);
              
              // MimeType aniqlash
              let mimeType = rawMsg.file?.mimeType || '';
              const mediaDoc = (rawMsg.media as any)?.document;
              if (mediaDoc?.attributes) {
                for (const attr of mediaDoc.attributes) {
                  if (attr.className === 'DocumentAttributeAudio' && attr.voice) {
                    mimeType = 'audio/ogg';
                  }
                  if (attr.className === 'DocumentAttributeVideo' && attr.roundMessage) {
                    mimeType = 'video/mp4';
                  }
                }
              }
              // Agar photo bo'lsa
              if (!mimeType && (rawMsg.media as any)?.photo) {
                mimeType = 'image/jpeg';
              }
              if (!mimeType) mimeType = 'application/octet-stream';

              if (mimeType === 'application/x-tgsticker' || mimeType === 'application/octet-stream') {
                console.log(`⚠️ [Chat ${chatId}] Qo'llab-quvvatlanmaydigan media formati: ${mimeType}, AI media qismiga qo'shilmaydi.`);
              } else {
                mediaParts.push({ data: buf.toString('base64'), mimeType });
                console.log(`✅ [Chat ${chatId}] Media muvaffaqiyatli yuklandi (${mimeType}, ${Math.round(buf.length / 1024)}KB)`);
              }
            }
          } else {
            console.log(`⚠️ [Chat ${chatId}] Media hajmi juda katta (${fileSize} bytes), AI ga yuborilmadi.`);
          }
        } catch (mediaErr: any) {
          console.error(`❌ [Chat ${chatId}] Media yuklashda xatolik:`, mediaErr?.message || mediaErr);
        }
      }

      const aiReply = await this.aiService.generateResponse(senderName, history, incomingTexts, mediaParts);

      if (!aiReply || aiReply.trim().length === 0) {
        console.warn('⚠️ Bo\'sh javob qaytdi.');
        return;
      }

      if (aiReply.includes('IGNORE_MESSAGE')) {
        console.log('🔇 [AI] Xabar inkor qilindi (shaxsiy/norasmiy). Javob berilmaydi.');
        return;
      }

      // 3. Javobni to'g'ridan-to'g'ri xabarga reply qilish yoki yuborish
      try {
        await rawMsg.reply({ message: aiReply });
        console.log(`📤 [Muvaffaqiyatli Reply Yuborildi] ${senderName} ga: "${aiReply}"\n`);
      } catch (replyErr) {
        // Fallback: sendMessage
        await this.client.sendMessage(rawMsg.peerId || chatId, { message: aiReply });
        console.log(`📤 [Muvaffaqiyatli Send Yuborildi] ${senderName} ga: "${aiReply}"\n`);
      }
    } catch (error: any) {
      console.error(`❌ [Xatolik - Chat ${chatId}]:`, error?.message || error);
    }
  }
}
