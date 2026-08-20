import { Telegraf } from 'telegraf';
import { MemoryManager } from './memory.js';
import { Config } from './config.js';

export class AdminBot {
  private bot: Telegraf;
  private memoryManager: MemoryManager;
  private adminId: string;

  constructor(config: Config, memoryManager: MemoryManager, ownerId?: string) {
    this.memoryManager = memoryManager;
    this.bot = new Telegraf(config.botToken);
    this.adminId = config.adminId || ownerId || '';

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
        `/status - AIning holati va muzlatilgan chatlarni ko'rish`,
        { parse_mode: 'Markdown' }
      );
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
