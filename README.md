# 🤖 Telegram AI Auto-Responder (Oxirgi 50 ta xabar tahlili bilan)

Telegram shaxsiy lichkangizga (DM) kelgan xabarlarga suhbat tarixidagi **oxirgi 50 ta xabarni** inobatga olgan holda **Google Gemini 2.0 / 1.5 Flash** orqali avtomatik, aqlli va xushmuomala javob beruvchi shaxsiy AI Agent.

---

## ✨ Imkoniyatlari

- 📚 **50 ta Xabar Konteksti:** Suhbatdosh bilan bo'lgan oldingi 50 ta xabarni xronologik o'rganib, mavzudan chiqmagan holda javob beradi.
- ⚡ **Google Gemini 2.0 Flash:** Juda tezkor (1-2 soniya) va tabiiy insondek javob generatsiyasi.
- 🛑 **Anti-Loop Himoyasi:** O'zingiz yozgan xabarlarga javob qaytarmaydi, cheksiz siklga kirmaydi.
- 👥 **Faqat Shaxsiy Lichka (DM):** Guruh va kanallardagi xabarlarni bezovta qilmaydi.
- ⏱️ **Debounce (Xabarlar to'plami):** Suhbatdosh ketma-ket 4-5 ta qisqa xabar yozsa, ularning barchasini bitta qilib umumiy javob qaytaradi.
- ⌨️ **Insoniy Typing Imitatsiyasi:** Javob yuborishdan oldin Telegramda `yozmoqda... (typing)` holatini ko'rsatadi.
- 🔇 **Aqlli Muzlatish (Manual Intervention):** Agar siz o'zingiz lichkada suhbatga kirsangiz, AI ushbu chatni 15 daqiqaga avtomatik to'xtatadi.
- 🎛️ **Jonli Boshqaruv Komandalari:** Telegramning o'zidan turib `.ai on`, `.ai off`, `.ai status`, `.ai unmute` komandalari orqali boshqarish.

---

## 🚀 O'rnatish va Ishga Tushirish

### 1. API Kalitlarni Olish

#### A. Telegram API ID & Hash (Akkaunt uchun):
1. [my.telegram.org](https://my.telegram.org) saytiga kiring va telefon raqamingiz orqali kiring.
2. **API development tools** bo'limiga o'ting.
3. Yangi ilova yarating (masalan: `MyAIAgent`) va **`App api_id`** hamda **`App api_hash`** ni nusxalab oling.

#### B. Google Gemini API Key:
1. [aistudio.google.com](https://aistudio.google.com) ga kiring.
2. **Get API key** tugmasini bosing va bepul API kalit yarating.

---

### 2. Konfiguratsiya (.env)

Loyiha ildizida `.env` fayl yarating (yoki `.env.example` dan nusxa oling):

```env
TELEGRAM_API_ID=12345678
TELEGRAM_API_HASH=your_api_hash_here
GEMINI_API_KEY=AIzaSy...
GEMINI_MODEL=gemini-2.0-flash
HISTORY_LIMIT=50
DEBOUNCE_MS=4000
SIMULATE_TYPING=true
BLACKLIST_USERS=
```

---

### 3. Ishga Tushirish

```bash
# Dasturni ishga tushirish
npm run dev
```

> ℹ️ **Birinchi marta ishga tushganda:**
> Dastur konsolda telefon raqamingizni so'raydi: `+998901234567`.
> Telegramingizga kelgan 5 xonali kodni kiritasiz.
> Muvaffaqiyatli kirgach, sessiya `.session` fayliga saqlanadi va keyingi safar qayta kod so'ramaydi!

---

### 4. 24/7 Doimiy Ishlatish (PM2 orqali)

Dasturni kompyuter yoki VPS serverda orqa fonda doimiy ishlatish uchun:

```bash
npm run build
npm install -g pm2
pm2 start dist/index.js --name "tg-ai-responder"
pm2 save
```

---

## 🕹️ Telegram Ichidagi Boshqaruv Komandalari

O'zingizning "Saved Messages" (Saqlangan xabarlar) yoki istalgan chatda yozishingiz mumkin:

- `.ai on` — Barcha chatlarda AI javob berishni yoqish
- `.ai off` — AI javob berishni butunlay to'xtatish
- `.ai status` — Joriy model va holatni ko'rish
- `.ai unmute` — Siz qo'lda yozganingiz uchun muzlatilgan chatda AIni darhol qayta yoqish
