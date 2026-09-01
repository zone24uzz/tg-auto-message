import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export interface Config {
  apiId: number;
  apiHash: string;
  sessionString: string;
  geminiApiKey: string;
  geminiModel: string;
  historyLimit: number;
  debounceMs: number;
  simulateTyping: boolean;
  blacklistUsers: string[];
  systemPrompt: string;
  botToken: string;
  adminId: string;
}

export function loadConfig(): Config {
  const apiId = parseInt(process.env.TELEGRAM_API_ID || '0', 10);
  const apiHash = process.env.TELEGRAM_API_HASH || '';
  const geminiApiKey = process.env.GEMINI_API_KEY || '';

  if (!apiId || !apiHash) {
    console.warn('⚠️ DIQQAT: TELEGRAM_API_ID va TELEGRAM_API_HASH .env faylda ko\'rsatilmagan!');
  }

  if (!geminiApiKey) {
    console.warn('⚠️ DIQQAT: GEMINI_API_KEY .env faylda ko\'rsatilmagan!');
  }

  const blacklistUsers = (process.env.BLACKLIST_USERS || '')
    .split(',')
    .map(u => u.trim().toLowerCase().replace('@', ''))
    .filter(Boolean);

  const defaultSystemPrompt = `Siz Komron Xidoyatov nomidan (yoki uning aqlli shaxsiy AI assistenti sifatida) Telegram shaxsiy lichkasida (DM) xabarlarga javob beruvchi yordamchisiz.

ASOSIY VAZIFALAR VA QOIDALAR:
1. Suhbatdosh bilan bo'lgan oldingi xabarlar tarixini (oxirgi 50 ta xabargacha) diqqat bilan o'rganing va suhbat kontekstini yo'qotmang.
2. Xushmuomala, do'stona, aniq va lo'nda javob bering. Telegram formatiga mos ravishda qisqa va tushunarli bo'lsin.
3. Foydalanuvchi qaysi tilda yozsa (O'zbek, Rus, Ingliz), aynan shu tilda javob qaytaring.
4. Agar foydalanuvchi jiddiy taklif, loyiha yoki shoshilinch ish bo'yicha yozgan bo'lsa: "Xabaringizni qabul qildim, Komron bo'shashi bilan o'zi ham batafsil yozadi" deb tushuntiring.
5. Hech qachon o'zingizni sun'iy robotdek quruq tutmang, samimiy va insoniy ohangda javob bering.
6. Markdown formatidan faqat zarur hollarda foydalaning (qalin yozuv yoki ro'yxat).
7. MUHIM: Agar foydalanuvchi shaxsiy, norasmiy savollar yoki takliflar bersa (masalan, "futbol go?", "qattasan", "choyxona bormi"), BARCHASINI INKOR QILING va xabarga umuman javob bermang. Bunday hollarda FAQATGINA "IGNORE_MESSAGE" degan so'zni qaytaring, boshqa hech narsa yozmang.
8. MUHIM: Agar foydalanuvchi "sen kimsan?", "kim bu o'zi?" yoki shunga o'xshash savol bersa, ularga faqatgina "Man komronmman" deb javob bering.
9. Agar foydalanuvchi ovozli xabar (voice), dumaloq video (video note), rasm yoki video yuborgan bo'lsa, siz uni ko'rasiz/eshitasiz. Undagi mazmunni tushunib, suhbat kontekstiga mos ravishda javob bering. Masalan, ovozli xabarda savol berilgan bo'lsa — javob qaytaring. Rasm yuborilgan bo'lsa — rasm haqida fikr bildiring.`;

  return {
    apiId,
    apiHash,
    sessionString: process.env.TELEGRAM_SESSION || '',
    geminiApiKey,
    geminiModel: process.env.GEMINI_MODEL || 'gemini-3.6-flash',
    historyLimit: parseInt(process.env.HISTORY_LIMIT || '50', 10),
    debounceMs: parseInt(process.env.DEBOUNCE_MS || '4000', 10),
    simulateTyping: process.env.SIMULATE_TYPING !== 'false',
    blacklistUsers,
    systemPrompt: defaultSystemPrompt,
    botToken: process.env.BOT_TOKEN || '',
    adminId: process.env.ADMIN_ID || '',
  };
}
