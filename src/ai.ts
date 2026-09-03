import { GoogleGenerativeAI } from '@google/generative-ai';

export interface MediaPart {
  mimeType: string;
  data: string; // base64
}

export interface ChatMessage {
  id: number;
  senderName: string;
  isMe: boolean;
  text: string;
  date: Date;
  media?: MediaPart;
}

export class AIService {
  private genAI: GoogleGenerativeAI;
  private modelName: string;
  private systemPrompt: string;

  constructor(apiKey: string, modelName: string = 'gemini-3.8-flash', systemPrompt: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.modelName = modelName;
    this.systemPrompt = systemPrompt;
  }

  public setSystemPrompt(prompt: string) {
    this.systemPrompt = prompt;
  }

  public async generateResponse(
    partnerName: string,
    history: ChatMessage[],
    incomingTexts: string[],
    mediaParts: MediaPart[] = []
  ): Promise<string> {
    if (!this.genAI) {
      throw new Error('Google Generative AI API kaliti topilmadi!');
    }

    try {
      const model = this.genAI.getGenerativeModel({
        model: this.modelName,
        systemInstruction: this.systemPrompt,
      });

      // Format last 50 messages chronologically
      const formattedHistory = history
        .map((msg) => {
          const sender = msg.isMe ? 'Men (Komron)' : partnerName;
          const time = msg.date.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
          const mediaLabel = msg.media ? ` [Fayl yuborildi: ${msg.media.mimeType}]` : '';
          return `[${time}] ${sender}: ${msg.text}${mediaLabel}`;
        })
        .join('\n');

      const currentMessageBlock = incomingTexts.map((text) => `${partnerName}: ${text}`).join('\n');

      const userPrompt = `
Quyida ${partnerName} bilan bo'lgan oldingi suhbat tarixi (oxirgi xabarlar):
--- SUHBAT TARIXI (OXIRGI 50 TA XABAR) ---
${formattedHistory || "(Hozircha oldingi xabarlar yo'q)"}
------------------------------------------

YANGI KELGAN XABAR(LAR):
${currentMessageBlock}

Vazifa: Yuqoridagi butun suhbat konteksti va yangi xabar(lar) (agar media fayl biriktirilgan bo'lsa uni ham tahlil qilib) asosida ${partnerName} ga eng to'g'ri, mantiqiy va xuddi insondek (tabiiy, ko'cha tilida yoki qisqa) javob qaytaring. Faqat javob matnining o'zini yozing.
`;

      const contents: any[] = [userPrompt];
      for (const media of mediaParts) {
        contents.push({
          inlineData: {
            data: media.data,
            mimeType: media.mimeType
          }
        });
      }

      const result = await model.generateContent(contents);
      const response = await result.response;
      let text = response.text().trim();

      // Clean any accidental "Men: " prefixes if the model added it
      text = text.replace(/^(Men|Komron|Assistant):\s*/i, '');

      return text;
    } catch (error: any) {
      console.error('❌ Gemini AI xatoligi:', error?.message || error);
      throw error;
    }
  }
}
