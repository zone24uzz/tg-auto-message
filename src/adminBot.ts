import { Telegraf } from 'telegraf';
import { MemoryManager } from './memory.js';
import { Config, saveDynamicSettings, loadConfig } from './config.js';
import { globalLogs } from './logger.js';
import { TelegramService } from './telegram.js';

export class AdminBot {
  private bot: Telegraf;
  private memoryManager: MemoryManager;
  private telegramService: TelegramService;
  private adminId: string;

  constructor(config: Config, telegramService: TelegramService) {
    this.telegramService = telegramService;
    this.memoryManager = telegramService.getMemoryManager();
    this.bot = new Telegraf(config.botToken);
    this.adminId = config.adminId || telegramService.getMeId() || '';

    this.setupHandlers();
  }

  private setupHandlers() {
    this.bot.use(async (ctx, next) => {
      const userId = ctx.from?.id.toString();
      
      if (!this.adminId && userId) {
        this.adminId = userId;
        console.log(`👑 Boshqaruv boti admini o'rnatildi: ${this.adminId}`);
      }

      if (userId !== this.adminId) {
        return;
      }
      return next();
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
      if (!newModel) return ctx.reply('❌ Iltimos, model nomini kiriting. Masalan: `/setmodel gemini-3.6-flash`', { parse_mode: 'Markdown' });
      
      saveDynamicSettings({ geminiModel: newModel });
      this.telegramService.updateConfig(loadConfig());
      ctx.reply(`✅ Model muvaffaqiyatli \`${newModel}\` ga o'zgartirildi!`, { parse_mode: 'Markdown' });
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
    this.bot.launch().then(() => {
      console.log('🤖 Boshqaruv (Admin) boti ishga tushdi!');
    }).catch(err => {
      console.error('❌ Boshqaruv botini ishga tushirishda xatolik:', err);
    });

    process.once('SIGINT', () => this.bot.stop('SIGINT'));
    process.once('SIGTERM', () => this.bot.stop('SIGTERM'));
  }
}
