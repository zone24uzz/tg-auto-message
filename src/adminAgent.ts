import { GoogleGenerativeAI, FunctionDeclaration, SchemaType } from '@google/generative-ai';
import { TelegramService } from './telegram.js';
import { MemoryManager } from './memory.js';
import { loadConfig } from './config.js';

export class AdminAgent {
  private genAI: GoogleGenerativeAI;
  private telegramService: TelegramService;
  private memoryManager: MemoryManager;
  private chatSession: any = null;
  private activeStopwatch: number | null = null;

  constructor(telegramService: TelegramService) {
    this.telegramService = telegramService;
    this.memoryManager = telegramService.getMemoryManager();
    const config = loadConfig();
    this.genAI = new GoogleGenerativeAI(config.geminiApiKey);
  }

  public resetSession() {
    this.chatSession = null;
  }

  private initSession() {
    if (this.chatSession) return;
    
    const config = loadConfig();
    const modelName = config.geminiModel || "gemini-3.7-flash";
    const model = this.genAI.getGenerativeModel({
      model: modelName,
      systemInstruction: "Siz Telegram AI Auto-Responder loyihasining boshqaruvchi agentisiz. Egasi (Admin) siz bilan to'g'ridan-to'g'ri Telegram bot orqali gaplashmoqda. Vazifangiz:\n1. Adminga har qanday savollarida yordam berish (odatiy AI kabi).\n2. Adminga botni boshqarishda yordam berish. Sizda asboblar (tools) bor.\n3. Agar admin 'falonchiga salom deb yubor' desa, sendTelegramMessage asbobidan foydalaning.\n4. Admin qisqa yozsa, qisqa va aniq javob bering. Do'stona munosabatda bo'ling.\n5. Agar Github yoki Vercel haqida so'rasa, ularni maxsus asboblar orqali chaqiring.",
      tools: [
        {
          functionDeclarations: [
            {
              name: "sendTelegramMessage",
              description: "Foydalanuvchiga Telegram orqali shaxsiy xabar yuborish. Bu asbob orqali siz admin nomidan boshqa odamlarga xabar yozishingiz mumkin.",
              parameters: {
                type: SchemaType.OBJECT,
                properties: {
                  usernameOrId: {
                    type: SchemaType.STRING,
                    description: "Foydalanuvchi ID raqami yoki @username"
                  },
                  message: {
                    type: SchemaType.STRING,
                    description: "Yuboriladigan xabar matni"
                  }
                },
                required: ["usernameOrId", "message"]
              }
            },
            {
              name: "getMutedChats",
              description: "Hozirda AI javob bermaydigan (muzlatilgan) barcha chatlarni ro'yxatini olish",
            },
            {
              name: "muteChat",
              description: "Ma'lum bir chatni muzlatish (AI u yerda yozmaydi)",
              parameters: {
                type: SchemaType.OBJECT,
                properties: {
                  chatId: { type: SchemaType.STRING, description: "Chat ID si" },
                  durationMinutes: { type: SchemaType.NUMBER, description: "Necha daqiqaga muzlatish (mangu bo'lsa -1)" }
                },
                required: ["chatId", "durationMinutes"]
              }
            },
            {
              name: "unmuteChat",
              description: "Muzlatilgan chatni qayta ochish",
              parameters: {
                type: SchemaType.OBJECT,
                properties: {
                  chatId: { type: SchemaType.STRING, description: "Chat ID si" }
                },
                required: ["chatId"]
              }
            },
            {
              name: "checkGithubStatus",
              description: "GitHub dagi loyiha (repo) holatini yoki oxirgi commitlarni tekshirish",
              parameters: {
                type: SchemaType.OBJECT,
                properties: {
                  repoName: { type: SchemaType.STRING, description: "Repo nomi, masalan zone24uzz/tg-auto-message" }
                },
                required: ["repoName"]
              }
            },
            {
              name: "triggerVercelDeploy",
              description: "Vercel da deployni ishga tushirish yoki holatini ko'rish",
              parameters: {
                type: SchemaType.OBJECT,
                properties: {
                  action: { type: SchemaType.STRING, description: "deploy yoki status" }
                }
              }
            },
            {
              name: "setTimer",
              description: "Ma'lum vaqtdan so'ng adminga eslatma yoki taymer xabarini yuborish",
              parameters: {
                type: SchemaType.OBJECT,
                properties: {
                  minutes: { type: SchemaType.NUMBER, description: "Necha daqiqadan so'ng" },
                  message: { type: SchemaType.STRING, description: "Eslatma matni" }
                },
                required: ["minutes", "message"]
              }
            },
            {
              name: "startStopwatch",
              description: "Sekundomerni ishga tushirish (vaqtni hisoblashni boshlash)",
            },
            {
              name: "stopStopwatch",
              description: "Sekundomerni to'xtatish va qancha vaqt o'tganini bilish",
            },
            {
              name: "getWeather",
              description: "Qaysidir shahar ob-havosini bilish",
              parameters: {
                type: SchemaType.OBJECT,
                properties: {
                  city: { type: SchemaType.STRING, description: "Shahar nomi (masalan: Tashkent)" }
                },
                required: ["city"]
              }
            }
          ]
        }
      ]
    });

    this.chatSession = model.startChat({
      history: [],
    });
  }

  public async handleAdminMessage(messageContent: string | any[]): Promise<string> {
    this.initSession();

    try {
      const result = await this.chatSession.sendMessage(messageContent);
      const call = result.response.functionCalls()?.[0];
      
      if (call) {
        const { name, args } = call;
        let functionResponse = "";

        if (name === 'sendTelegramMessage') {
          const success = await this.telegramService.sendMessageTo(args.usernameOrId, args.message);
          functionResponse = success ? "Xabar muvaffaqiyatli yuborildi." : "Xatolik: Xabarni yuborishning iloji bo'lmadi. Ehtimol username xato yoki foydalanuvchi topilmadi.";
        } 
        else if (name === 'getMutedChats') {
          const muted = this.memoryManager.getMutedChats();
          functionResponse = muted.length ? `Muzlatilgan chatlar ID lari: ${muted.join(', ')}` : "Hozirda hech qaysi chat muzlatilmagan.";
        }
        else if (name === 'muteChat') {
          this.memoryManager.muteChat(args.chatId, args.durationMinutes === -1 ? null : args.durationMinutes);
          functionResponse = `Chat ${args.chatId} muvaffaqiyatli muzlatildi.`;
        }
        else if (name === 'unmuteChat') {
          this.memoryManager.unmuteChat(args.chatId);
          functionResponse = `Chat ${args.chatId} muzlatishdan chiqarildi.`;
        }
        else if (name === 'checkGithubStatus') {
          functionResponse = `GitHub bo'yicha so'rov qabul qilindi. Hozircha GitHub ulanishi to'liq qilinmagan. Siz .env ga GITHUB_TOKEN qo'shishingiz kerak.`;
        }
        else if (name === 'triggerVercelDeploy') {
          functionResponse = `Vercel bo'yicha ${args.action} so'rovi qabul qilindi. Vercel API tokeni yo'q.`;
        }
        else if (name === 'setTimer') {
          const ms = args.minutes * 60000;
          setTimeout(() => {
            this.telegramService.sendMessageTo(loadConfig().adminId, `⏰ **TAYMER TUGADI:** ${args.message}`);
          }, ms);
          functionResponse = `Taymer ${args.minutes} daqiqaga o'rnatildi. Vaqti kelganda xabar yuboraman.`;
        }
        else if (name === 'startStopwatch') {
          this.activeStopwatch = Date.now();
          functionResponse = `Sekundomer ishga tushdi.`;
        }
        else if (name === 'stopStopwatch') {
          if (this.activeStopwatch) {
            const elapsed = ((Date.now() - this.activeStopwatch) / 1000).toFixed(1);
            this.activeStopwatch = null;
            functionResponse = `Sekundomer to'xtatildi. O'tgan vaqt: ${elapsed} soniya.`;
          } else {
            functionResponse = `Hozircha hech qanday sekundomer yoniq emas.`;
          }
        }
        else if (name === 'getWeather') {
          try {
            const res = await fetch(`https://wttr.in/${encodeURIComponent(args.city)}?format=3`);
            const text = await res.text();
            functionResponse = `Ob-havo ma'lumoti: ${text}`;
          } catch (e) {
            functionResponse = "Ob-havo ma'lumotini olishda xatolik yuz berdi.";
          }
        }

        // Return function response to model
        const secondResult = await this.chatSession.sendMessage([{
          functionResponse: {
            name,
            response: { result: functionResponse }
          }
        }]);

        return secondResult.response.text();
      }

      return result.response.text();
    } catch (e: any) {
      console.error("Admin Agent Error:", e);
      return "Kechirasiz, xatolik yuz berdi: " + e.message;
    }
  }
}
