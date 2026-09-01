import http from 'http';
import { loadConfig } from './config.js';
import { TelegramService } from './telegram.js';
import { AdminBot } from './adminBot.js';
import { setupLogger } from './logger.js';

setupLogger();

function startHealthCheckServer() {
  const port = process.env.PORT || 0;
  const server = http.createServer((req, res) => {
    if (req.url === '/health' || req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'ok',
          uptime: Math.floor(process.uptime()),
          service: 'Telegram AI Auto-Responder',
          timestamp: new Date().toISOString(),
        })
      );
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  server.listen(port, () => {
    console.log(`🌐 Web/Health-Check server port ${port} da ishga tushdi (Render uchun tayyor)`);
  });
}

async function bootstrap() {
  console.log('🤖 Telegram AI Auto-Responder ishga tushirilmoqda...\n');

  startHealthCheckServer();

  try {
    const config = loadConfig();
    const service = new TelegramService(config);
    await service.start();

    if (config.botToken) {
      const adminBot = new AdminBot(config, service);
      adminBot.launch();
    } else {
      console.log('⚠️ Boshqaruv boti ishga tushmadi: BOT_TOKEN ko\'rsatilmagan.');
    }
  } catch (error: any) {
    console.error('❌ Xatolik yuz berdi:', error?.message || error);
    process.exit(1);
  }
}

// Xavfsiz to'xtatish
process.on('SIGINT', () => {
  console.log('\n🛑 Dastur to\'xtatildi.');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Dastur to\'xtatildi.');
  process.exit(0);
});

bootstrap();
