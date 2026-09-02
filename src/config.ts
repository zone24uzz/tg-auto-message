import dotenv from 'dotenv';
import { SettingModel } from './db.js';

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
  adminPassword?: string;
}

let dynamicSettings: any = {};

const defaultSystemPrompt = `Siz to'g'ridan-to'g'ri Komron Xidoyatovning o'zisiz (AI yoki yordamchi emassiz). Telegram shaxsiy lichkangizda (DM) do'stlaringiz va tanishlaringiz bilan yozishyapman deb tasavvur qiling.

ASOSIY VAZIFALAR VA QOIDALAR:
1. O'zingizni HECH QACHON sun'iy intellekt, bot yoki yordamchi (assistant) deb tanishtirmang. Siz Komronsiz.
2. ADABIY TILDA YOZMANG! Xuddi oddiy odamdek, qisqa, kundalik ko'cha tilida, kerak bo'lsa krill/lotin aralash va norasmiy (slanglar bilan) javob bering. "Sizga qanday yordam bera olaman?", "Xabaringizni qabul qildim", "Salom, yaxshimisiz" kabi robotlarga xos rasmiy gaplarni umuman ishlatmang.
3. Javoblaringiz imkon qadar qisqa bo'lsin (1-2 ta gap yoki so'z). Odamlar telegramda doston yozmaydi. 
4. Suhbatdoshingiz qaysi tilda va qanaqa ohangda (jiddiy, hazilkash, qisqa) yozsa, aynan shunga moslashib, "vibe" ni buzmang.
5. Agar birov "botmisan?", "o'zingmisan?" deb shubhalansa, "jinnimisan, o'zimman", "nimalar devossan 😂", "odamman-ku" kabi mutlaqo tabiiy va ishonarli javob qaytaring.
6. Agar foydalanuvchi jiddiy loyiha, ish yoki zakaz haqida yozsa, uni xuddi o'zingizdek qabul qilib: "Tushunarli, hozir sal bandroq edim, bo'shab o'zim yozvoraman" yoki shunga o'xshash tabiiy gap bilan vaqtni orqaga suring.
7. Shaxsiy yoki bemani savollarga ("qattasan", "choyxona bormi", "kimsan o'zi") qisqa qilib "uyda", "yo'q", "tinchlikmi kim bu" deb odamdek javob bering, inkor qilmang.
8. Ovozli xabar, rasm yoki videolarga xuddi odamdek reaksiya bering ("ha ko'rdim", "tushunmadim, nima bu", "zo'rku").`;

export async function initDynamicSettings() {
  try {
    const settings = await SettingModel.find({});
    for (const setting of settings) {
      dynamicSettings[setting.key] = setting.value;
    }
  } catch (error) {
    console.error('Sozlamalarni DB dan o\'qishda xatolik:', error);
  }
}

export function saveDynamicSettings(settings: Partial<Config>) {
  try {
    dynamicSettings = { ...dynamicSettings, ...settings };
    
    // Async tarzda DB ga saqlash
    for (const [key, value] of Object.entries(settings)) {
      SettingModel.findOneAndUpdate(
        { key },
        { value },
        { upsert: true, new: true }
      ).catch(err => console.error(`Sozlamani DB ga saqlashda xato (${key}):`, err));
    }
  } catch (e) {
    console.error('Sozlamalarni saqlashda xatolik:', e);
  }
}

export function loadConfig(): Config {
  const apiId = parseInt(process.env.TELEGRAM_API_ID || '0', 10);
  const apiHash = process.env.TELEGRAM_API_HASH || '';
  const geminiApiKey = process.env.GEMINI_API_KEY || '';

  if (!apiId || !apiHash) {
    console.warn("⚠️ DIQQAT: TELEGRAM_API_ID va TELEGRAM_API_HASH .env faylda ko'rsatilmagan!");
  }

  if (!geminiApiKey) {
    console.warn("⚠️ DIQQAT: GEMINI_API_KEY .env faylda ko'rsatilmagan!");
  }

  const blacklistUsers = (process.env.BLACKLIST_USERS || '')
    .split(',')
    .map(u => u.trim().toLowerCase().replace('@', ''))
    .filter(Boolean);

  return {
    apiId,
    apiHash,
    sessionString: process.env.TELEGRAM_SESSION || '',
    geminiApiKey,
    geminiModel: dynamicSettings.geminiModel || process.env.GEMINI_MODEL || 'gemini-3.7-flash',
    historyLimit: dynamicSettings.historyLimit || parseInt(process.env.HISTORY_LIMIT || '50', 10),
    debounceMs: dynamicSettings.debounceMs || parseInt(process.env.DEBOUNCE_MS || '4000', 10),
    simulateTyping: dynamicSettings.simulateTyping !== undefined ? dynamicSettings.simulateTyping : process.env.SIMULATE_TYPING !== 'false',
    blacklistUsers,
    systemPrompt: dynamicSettings.systemPrompt || defaultSystemPrompt,
    botToken: process.env.BOT_TOKEN || '',
    adminId: dynamicSettings.adminId || process.env.ADMIN_ID || '',
    adminPassword: process.env.ADMIN_PASSWORD || 'komron2026',
  };
}
