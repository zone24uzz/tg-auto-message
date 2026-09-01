import { Telegraf, Markup } from 'telegraf';
import { MemoryManager } from './memory.js';
import { Config, saveDynamicSettings, loadConfig } from './config.js';
import { globalLogs } from './logger.js';
import { TelegramService } from './telegram.js';

export class AdminBot {
  private bot: Telegraf;
  private memoryManager: MemoryManager;
  private telegramService: TelegramService;
  private adminId: string;

  private adminPassword?: string;

  constructor(config: Config, telegramService: TelegramService) {
    this.telegramService = telegramService;
    this.memoryManager = telegramService.getMemoryManager();
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
        `/setmodel <model> - Gemini modelini o'zgartirish\n` +
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
      const status = this.memoryManager.isEnabled() ? '🟢 Yoniq' : '🔴 O\'chiq';
      const mutedChats = this.memoryManager.getMutedChats();
      let mutedText = 'Muzlatilgan chatlar yo\'q.';
      if (mutedChats.length > 0) {
        mutedText = 'Muzlatilgan chatlar (ID):\n' + mutedChats.join('\n');
      }

      ctx.reply(
        `📊 **AI Holati:** ${status}\n\n` +
        `🔕 **Muzlatilgan chatlar:**\n${mutedText}`,
        { parse_mode: 'Markdown' }
      );
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
  }

  public launch() {
    this.bot.telegram.setMyCommands([
      { command: 'status', description: "AIning holati va muzlatilgan chatlarni ko'rish" },
      { command: 'logs', description: "Oxirgi 30 ta tizim loglarini ko'rish" },
      { command: 'settings', description: "Joriy sozlamalarni ko'rish" },
      { command: 'on', description: "AIni barcha chatlar uchun yoqish" },
      { command: 'off', description: "AIni barcha chatlar uchun o'chirish" },
      { command: 'setmodel', description: "Gemini modelini o'zgartirish" },
      { command: 'setprompt', description: "AI system promptini o'zgartirish" }
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
