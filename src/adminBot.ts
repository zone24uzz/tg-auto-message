import { Telegraf, Markup } from 'telegraf';
import { MemoryManager } from './memory.js';
import { Config, saveDynamicSettings, loadConfig } from './config.js';
import { globalLogs } from './logger.js';
import { TelegramService } from './telegram.js';
import { AdminAgent } from './adminAgent.js';

export class AdminBot {
  private bot: Telegraf;
  private memoryManager: MemoryManager;
  private telegramService: TelegramService;
  private adminAgent: AdminAgent;
  private adminId: string;

  private adminPassword?: string;

  constructor(config: Config, telegramService: TelegramService) {
    this.telegramService = telegramService;
    this.memoryManager = telegramService.getMemoryManager();
    this.adminAgent = new AdminAgent(telegramService);
    this.bot = new Telegraf(config.botToken);
    this.adminId = config.adminId || telegramService.getMeId() || '';
    this.adminPassword = config.adminPassword;

    this.setupHandlers();
  }

  private setupHandlers() {
    this.bot.use(async (ctx, next) => {
      const userId = ctx.from?.id.toString();
      const text = (ctx.message as any)?.text || '';

      if (userId === this.adminId) {
        return next();
      }

      // Agar hali admin tasdiqlanmagan bo'lsa yoki admin boshqa bo'lsa
      if (text.startsWith('/login ')) {
        const pass = text.split(' ')[1];
        if (pass === this.adminPassword) {
          this.adminId = userId || '';
          saveDynamicSettings({ adminId: this.adminId });
          console.log(`👑 Yangi boshqaruv boti admini o'rnatildi: ${this.adminId}`);
          return ctx.reply('✅ Parol to\'g\'ri! Siz endi bot adminisiz. /start komandasini bosing.');
        } else {
          return ctx.reply('❌ Parol noto\'g\'ri!');
        }
      }

      return ctx.reply('🔒 Kechirasiz, siz ushbu botni boshqarish huquqiga ega emassiz. Agar admin bo\'lsangiz, `/login parol` shaklida parolingizni kiriting.', { parse_mode: 'Markdown' });
    });

    this.bot.start((ctx) => {
      const status = this.memoryManager.isEnabled() ? '🟢 Yoniq' : '🔴 O\'chiq';
      ctx.reply(
        `👋 Salom! Men AI Auto-Responderni boshqarish botiman.\n\n` +
        `📊 **Global Holat:** ${status}\n\n` +
        `Komandalar:\n` +
        `/on - AIni barcha chatlar uchun yoqish\n` +
        `/off - AIni barcha chatlar uchun o'chirish\n` +
        `/status - AIning holati va muzlatilgan chatlarni ko'rish\n` +
        `/logs - Oxirgi 30 ta tizim loglarini ko'rish\n` +
        `/settings - Joriy sozlamalarni ko'rish\n` +
        `/setmodel - Gemini modelini o'zgartirish\n` +
        `/setlimit <son> - Kontekst tarixini o'zgartirish\n` +
        `/setdelay <ms> - Kutish vaqtini o'zgartirish\n` +
        `/mute <id> - Chatni muzlatish (AI yozmaydi)\n` +
        `/unmute <id> - Chatni muzlatishdan chiqarish\n` +
        `/info <id> - Chat ID egasi kimligini ko'rish\n` +
        `/setprompt <matn> - AI system promptini o'zgartirish`,
        { parse_mode: 'Markdown' }
      );
    });

    this.bot.command('logs', (ctx) => {
      if (globalLogs.length === 0) {
        return ctx.reply('Loglar hozircha bo\'sh.');
      }
      // Loglarni HTML taglaridan tozalaymiz
      const logsText = globalLogs.join('\n').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/&/g, '&amp;');
      const truncated = logsText.length > 3900 ? logsText.substring(logsText.length - 3900) : logsText;
      
      ctx.reply(`📝 <b>Oxirgi loglar:</b>\n\n<pre>${truncated}</pre>`, { parse_mode: 'HTML' }).catch(err => console.error("Logs yuborishda xato:", err));
    });

    this.bot.command('on', (ctx) => {
      this.memoryManager.setEnabled(true);
      ctx.reply('🟢 **AI Auto-Responder barcha chatlar uchun yoqildi!**', { parse_mode: 'Markdown' });
    });

    this.bot.command('off', (ctx) => {
      this.memoryManager.setEnabled(false);
      ctx.reply('🔴 **AI Auto-Responder barcha chatlar uchun o\'chirildi!**', { parse_mode: 'Markdown' });
    });

    this.bot.command('status', (ctx) => {
      this.sendStatusMenu(ctx);
    });

    this.bot.action('status_main', (ctx) => {
      ctx.answerCbQuery().catch(() => {});
      this.sendStatusMenu(ctx, true);
    });

    this.bot.action(/^status_chat_(.+)$/, async (ctx) => {
      const chatId = ctx.match[1];
      await this.showMutedChatInfo(ctx, chatId);
    });

    this.bot.action(/^status_adj_(.+)_(.+)$/, async (ctx) => {
      const chatId = ctx.match[1];
      const mins = parseInt(ctx.match[2], 10);
      
      this.memoryManager.adjustMuteTime(chatId, mins);
      ctx.answerCbQuery(`${mins > 0 ? '+' : ''}${mins} daqiqa!`).catch(() => {});
      await this.showMutedChatInfo(ctx, chatId);
    });

    this.bot.action(/^status_unmute_(.+)$/, async (ctx) => {
      const chatId = ctx.match[1];
      this.memoryManager.unmuteChat(chatId);
      ctx.answerCbQuery('Muvaffaqiyatli ochildi!').catch(() => {});
      this.sendStatusMenu(ctx, true);
    });

    this.bot.command('settings', (ctx) => {
      const config = loadConfig();
      // Prompt ichidagi maxsus belgilarni qochirish
      const safePrompt = config.systemPrompt.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/&/g, '&amp;');
      
      ctx.reply(
        `⚙️ <b>Joriy Sozlamalar:</b>\n\n` +
        `🤖 <b>Model:</b> <code>${config.geminiModel}</code>\n` +
        `📚 <b>Kontekst:</b> <code>${config.historyLimit} xabar</code>\n` +
        `⏱ <b>Kutish:</b> <code>${config.debounceMs}ms</code>\n\n` +
        `📝 <b>System Prompt:</b>\n<pre>${safePrompt}</pre>`,
        { parse_mode: 'HTML' }
      ).catch(err => console.error("Settings yuborishda xato:", err));
    });

    this.bot.command('setmodel', (ctx) => {
      const parts = ctx.message.text.split(' ');
      const newModel = parts[1];
      
      // Agar foydalanuvchi to'g'ridan-to'g'ri /setmodel nomini yozgan bo'lsa
      if (newModel) {
        saveDynamicSettings({ geminiModel: newModel });
        this.telegramService.updateConfig(loadConfig());
        this.adminAgent.resetSession();
        return ctx.reply(`✅ Model muvaffaqiyatli \`${newModel}\` ga o'zgartirildi!`, { parse_mode: 'Markdown' });
      }
      
      // Aks holda knopkalarni chiqaramiz
      ctx.reply('👇 Qaysi modelni ishlatmoqchisiz? Tanlang:', Markup.inlineKeyboard([
        [Markup.button.callback('⚡️ 3.5 Flash-Lite (Fast)', 'model_gemini-3.5-flash-lite')],
        [Markup.button.callback('🚀 3.7 Flash (All-around)', 'model_gemini-3.7-flash')],
        [Markup.button.callback('🧠 3.1 Pro (Advanced)', 'model_gemini-3.1-pro')]
      ]));
    });

    this.bot.action(/model_(.+)/, (ctx) => {
      const newModel = ctx.match[1];
      saveDynamicSettings({ geminiModel: newModel });
      this.telegramService.updateConfig(loadConfig());
      this.adminAgent.resetSession();
      
      ctx.answerCbQuery(`Model yangilandi: ${newModel}`);
      ctx.editMessageText(`✅ Model muvaffaqiyatli <b>${newModel}</b> ga o'zgartirildi!`, { parse_mode: 'HTML' }).catch(() => {});
    });

    this.bot.command('setprompt', (ctx) => {
      const text = ctx.message.text;
      const newPrompt = text.substring(text.indexOf(' ') + 1);
      if (!newPrompt || newPrompt === text) return ctx.reply('❌ Iltimos, prompt matnini kiriting. Masalan: `/setprompt Yangi prompt matni...`');
      
      saveDynamicSettings({ systemPrompt: newPrompt });
      this.telegramService.updateConfig(loadConfig());
      ctx.reply(`✅ System prompt muvaffaqiyatli o'zgartirildi!`);
    });
    this.bot.command('setlimit', (ctx) => {
      const parts = ctx.message.text.split(' ');
      const newLimit = parseInt(parts[1], 10);
      
      if (isNaN(newLimit) || newLimit < 1 || newLimit > 200) {
        return ctx.reply('❌ Iltimos, 1 dan 200 gacha bo\'lgan son kiriting. Masalan: `/setlimit 50`', { parse_mode: 'Markdown' });
      }
      
      saveDynamicSettings({ historyLimit: newLimit });
      this.telegramService.updateConfig(loadConfig());
      ctx.reply(`✅ Kontekst (tarix) muvaffaqiyatli **${newLimit}** ta xabarga o'zgartirildi!`, { parse_mode: 'Markdown' });
    });

    this.bot.command('setdelay', (ctx) => {
      const parts = ctx.message.text.split(' ');
      const newDelay = parseInt(parts[1], 10);
      
      if (isNaN(newDelay) || newDelay < 0 || newDelay > 60000) {
        return ctx.reply('❌ Iltimos, to\'g\'ri millisoniya (ms) kiriting. Masalan 4 soniya uchun: `/setdelay 4000`', { parse_mode: 'Markdown' });
      }
      
      saveDynamicSettings({ debounceMs: newDelay });
      this.telegramService.updateConfig(loadConfig());
      ctx.reply(`✅ Kutish vaqti muvaffaqiyatli **${newDelay}ms** ga o'zgartirildi!`, { parse_mode: 'Markdown' });
    });
    this.bot.command('mute', async (ctx) => {
      const parts = ctx.message.text.split(' ');
      const targetId = parts[1];
      
      if (!targetId) {
        return ctx.reply('❌ Iltimos, muzlatmoqchi bo\'lgan chat ID sini kiriting. Masalan: <code>/mute 123456789</code>', { parse_mode: 'HTML' });
      }
      
      const userInfo = await this.telegramService.getUserInfo(targetId);
      
      let text = `⏳ <b>Mute qilish vaqtini tanlang:</b>\n\n`;
      text += this.formatUserInfo(targetId, userInfo);
      
      ctx.reply(text, { 
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('30 daqiqa', `mute_30_${targetId}`), Markup.button.callback('1 soat', `mute_60_${targetId}`)],
          [Markup.button.callback('2 soat', `mute_120_${targetId}`), Markup.button.callback('4 soat', `mute_240_${targetId}`)],
          [Markup.button.callback('5 soat', `mute_300_${targetId}`), Markup.button.callback('24 soat', `mute_1440_${targetId}`)],
          [Markup.button.callback('Mangu (O\'zim ochmaguncha)', `mute_forever_${targetId}`)]
        ])
      }).catch(e => console.error("Mute options reply error:", e));
    });

    this.bot.action(/^mute_([^_]+)_(.+)$/, async (ctx) => {
      const durationStr = ctx.match[1];
      const targetId = ctx.match[2];
      
      const duration = durationStr === 'forever' ? null : parseInt(durationStr, 10);
      
      this.memoryManager.muteChat(targetId, duration);
      
      const userInfo = await this.telegramService.getUserInfo(targetId);
      let text = `⏸ <b>Muvaffaqiyatli muzlatildi (Mute)!</b>\n`;
      if (duration === null) {
          text += `Vaqti: <b>Cheksiz</b> (O'zingiz ochmaguningizcha AI yozmaydi)\n\n`;
      } else {
          let readableTime = duration >= 60 ? `${duration / 60} soat` : `${duration} daqiqa`;
          text += `Vaqti: <b>${readableTime}</b>\n\n`;
      }
      text += this.formatUserInfo(targetId, userInfo);
      
      ctx.answerCbQuery('Muvaffaqiyatli muzlatildi!').catch(() => {});
      ctx.editMessageText(text, { parse_mode: 'HTML' }).catch(() => {});
    });

    this.bot.command('unmute', async (ctx) => {
      const parts = ctx.message.text.split(' ');
      const targetId = parts[1];
      
      if (!targetId) {
        return ctx.reply('❌ Iltimos, muzlatishdan chiqarmoqchi bo\'lgan chat ID sini kiriting. Masalan: <code>/unmute 123456789</code>', { parse_mode: 'HTML' });
      }
      
      this.memoryManager.unmuteChat(targetId);
      const userInfo = await this.telegramService.getUserInfo(targetId);
      let text = `✅ <b>Muvaffaqiyatli muzlatishdan (Unmute) chiqarildi!</b>\n\n`;
      text += this.formatUserInfo(targetId, userInfo);
      
      ctx.reply(text, { parse_mode: 'HTML' }).catch(e => console.error("Unmute reply error:", e));
    });

    this.bot.command('info', async (ctx) => {
      const parts = ctx.message.text.split(' ');
      const targetId = parts[1];
      
      if (!targetId) {
        return ctx.reply('❌ Iltimos, chat ID yoki username kiriting. Masalan: <code>/info 123456789</code>', { parse_mode: 'HTML' });
      }

      const userInfo = await this.telegramService.getUserInfo(targetId);
      ctx.reply(this.formatUserInfo(targetId, userInfo), { parse_mode: 'HTML' }).catch(e => console.error("Info reply error:", e));
    });

    // Faqat ID yoki username tashlanganda ma'lumot chiqarish uchun yoki Agent bilan gaplashish uchun
    this.bot.on('message', async (ctx, next) => {
      const msg = ctx.message as any;
      if (msg.text && msg.text.startsWith('/')) return next();
      
      let text = msg.text || msg.caption || '';
      const contents: any[] = [];
      
      if (text) {
        contents.push(text);
      }
      
      if (msg.photo) {
        const photo = msg.photo[msg.photo.length - 1];
        try {
          const fileLink = await ctx.telegram.getFileLink(photo.file_id);
          const response = await fetch(fileLink.href);
          const arrayBuffer = await response.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          
          contents.push({
            inlineData: {
              data: buffer.toString('base64'),
              mimeType: 'image/jpeg'
            }
          });
          
          if (!text) contents.unshift("Bu rasmda nima tasvirlanganini tushuntirib bering.");
        } catch (err) {
          console.error("Rasm yuklashda xato:", err);
          return ctx.reply("❌ Rasmni yuklab olishda xatolik yuz berdi.");
        }
      }
      
      if (contents.length === 0) return next();

      // Agar text qisqa va aniq foydalanuvchi bo'lsa ma'lumot qaytarish
      if (contents.length === 1 && typeof contents[0] === 'string') {
        const txt = contents[0].trim();
        if (/^@?\w{3,30}$/.test(txt) && !txt.includes(' ')) {
          const userInfo = await this.telegramService.getUserInfo(txt);
          if (userInfo) {
            return ctx.reply(this.formatUserInfo(txt, userInfo), { parse_mode: 'HTML' }).catch(e => console.error("Text info reply error:", e));
          }
        }
      }
      
      ctx.sendChatAction('typing').catch(() => {});
      const messageData = contents.length === 1 && typeof contents[0] === 'string' ? contents[0] : contents;
      const agentReply = await this.adminAgent.handleAdminMessage(messageData, ctx);
      return ctx.reply(agentReply, { parse_mode: 'Markdown' }).catch(e => console.error("Agent reply error:", e));
    });

    // Pinned service message larni o'chirish (chatda ko'rinmasligi uchun)
    this.bot.on('pinned_message', async (ctx) => {
      try {
        await ctx.deleteMessage();
      } catch (e) {}
    });
  }

  private formatUserInfo(targetId: string, info: any): string {
    if (!info) return `🆔 <b>Kiritilgan:</b> <code>${targetId}</code>\n<i>(Ma'lumot topilmadi. Yoki bot bu odamni umuman tanimaydi)</i>`;
    
    let text = `👤 <b>Profil Ma'lumotlari:</b>\n`;
    text += `🆔 <b>ID:</b> <code>${info.id || targetId}</code>\n`;
    
    if (info.title) {
      text += `🏷 <b>Guruh/Kanal:</b> ${info.title}\n`;
    } else {
      if (info.firstName) text += `👤 <b>Ism:</b> ${info.firstName}\n`;
      if (info.lastName) text += `👥 <b>Familiya:</b> ${info.lastName}\n`;
    }
    if (info.username) text += `🔗 <b>Username:</b> @${info.username}\n`;
    
    return text;
  }

  private sendStatusMenu(ctx: any, isEdit = false) {
    const status = this.memoryManager.isEnabled() ? '🟢 Yoniq' : '🔴 O\'chiq';
    const mutedChats = this.memoryManager.getMutedChats();
    
    let text = `📊 <b>AI Global Holati:</b> ${status}\n\n`;
    let buttons = [];

    if (mutedChats.length === 0) {
      text += `🔕 <b>Muzlatilgan chatlar:</b> Yo'q.`;
    } else {
      text += `🔕 <b>Muzlatilgan chatlar (${mutedChats.length} ta):</b>\nBatafsil ma'lumot uchun quyidagilardan birini tanlang:`;
      for (const chatId of mutedChats) {
        buttons.push([Markup.button.callback(`👤 Chat: ${chatId}`, `status_chat_${chatId}`)]);
      }
    }

    const markup = buttons.length > 0 ? Markup.inlineKeyboard(buttons) : {};
    
    if (isEdit) {
      ctx.editMessageText(text, { parse_mode: 'HTML', ...markup }).catch(() => {});
    } else {
      ctx.reply(text, { parse_mode: 'HTML', ...markup }).catch((e: any) => console.error(e));
    }
  }

  private async showMutedChatInfo(ctx: any, chatId: string) {
    const isMuted = this.memoryManager.isChatMuted(chatId);
    if (!isMuted) {
      ctx.answerCbQuery('Bu chat endi muzlatilmagan!').catch(() => {});
      return this.sendStatusMenu(ctx, true);
    }

    const state = this.memoryManager.getChatState(chatId);
    const userInfo = await this.telegramService.getUserInfo(chatId);
    
    let text = `🔕 <b>Muzlatilgan Chat Ma'lumoti:</b>\n\n`;
    text += this.formatUserInfo(chatId, userInfo) + `\n`;
    
    let buttons = [];
    if (!state?.mutedUntil) {
      text += `⏳ <b>Holati:</b> 🔒 Mangu muzlatilgan (Siz ochmaguningizcha AI yozmaydi)\n`;
      buttons.push([Markup.button.callback('🔊 Unmute (Ochish)', `status_unmute_${chatId}`)]);
    } else {
      const now = Date.now();
      const diffMs = state.mutedUntil.getTime() - now;
      const diffMin = Math.ceil(diffMs / 60000);
      
      text += `⏳ <b>Holati:</b> Muzlatilgan\n`;
      let readableTime = diffMin >= 60 ? `${(diffMin / 60).toFixed(1)} soat` : `${diffMin} daqiqa`;
      text += `⏰ <b>Qachon ochiladi:</b> ${readableTime}dan so'ng\n`;
      
      buttons.push([
        Markup.button.callback('➖ 30 daq', `status_adj_${chatId}_-30`),
        Markup.button.callback('➕ 30 daq', `status_adj_${chatId}_30`)
      ]);
      buttons.push([
        Markup.button.callback('➖ 1 soat', `status_adj_${chatId}_-60`),
        Markup.button.callback('➕ 1 soat', `status_adj_${chatId}_60`)
      ]);
      buttons.push([Markup.button.callback('🔊 Unmute (Ochish)', `status_unmute_${chatId}`)]);
    }
    
    buttons.push([Markup.button.callback('🔙 Orqaga', 'status_main')]);

    ctx.answerCbQuery().catch(() => {});
    ctx.editMessageText(text, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) }).catch(() => {});
  }

  public launch() {
    this.bot.telegram.setMyCommands([
      { command: 'status', description: "AIning holati va muzlatilgan chatlarni ko'rish" },
      { command: 'logs', description: "Oxirgi 30 ta tizim loglarini ko'rish" },
      { command: 'settings', description: "Joriy sozlamalarni ko'rish" },
      { command: 'on', description: "AIni barcha chatlar uchun yoqish" },
      { command: 'off', description: "AIni barcha chatlar uchun o'chirish" },
      { command: 'setmodel', description: "Gemini modelini o'zgartirish" },
      { command: 'setprompt', description: "AI system promptini o'zgartirish" },
      { command: 'setlimit', description: "Kontekst xabarlar sonini o'zgartirish" },
      { command: 'setdelay', description: "Kutish vaqtini o'zgartirish" },
      { command: 'mute', description: "Ma'lum bir chatni muzlatish (ID orqali)" },
      { command: 'unmute', description: "Chatni muzlatishdan chiqarish (ID orqali)" },
      { command: 'info', description: "Chat ID orqali profil ma'lumotlarini olish" }
    ]).catch(err => console.error("Komandalarni Telegramga yuborishda xatolik:", err));

    this.bot.launch().then(() => {
      console.log('🤖 Boshqaruv (Admin) boti ishga tushdi!');
    }).catch(err => {
      console.error('❌ Boshqaruv botini ishga tushirishda xatolik:', err);
    });

    process.once('SIGINT', () => this.bot.stop('SIGINT'));
    process.once('SIGTERM', () => this.bot.stop('SIGTERM'));
  }
}
