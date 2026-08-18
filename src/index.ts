import http from 'http';
import { loadConfig } from './config.js';
import { TelegramService } from './telegram.js';

function startHealthCheckServer() {
  const port = process.env.PORT || 3000;
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
  console.clear();
  console.log('🤖 Telegram AI Auto-Responder ishga tushirilmoqda...\n');

  // Render Web Service uchun HTTP server
  startHealthCheckServer();

  try {
    const config = loadConfig();
    const service = new TelegramService(config);
    await service.start();
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
