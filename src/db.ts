import mongoose from 'mongoose';

const SettingSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: { type: mongoose.Schema.Types.Mixed, required: true }
});

const ChatStateSchema = new mongoose.Schema({
  chatId: { type: String, required: true, unique: true },
  isMuted: { type: Boolean, default: false },
  mutedUntil: { type: Date, default: null }
});

export const SettingModel = mongoose.model('Setting', SettingSchema);
export const ChatStateModel = mongoose.model('ChatState', ChatStateSchema);

export async function connectDB() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.warn("⚠️ MONGODB_URI .env faylda ko'rsatilmagan. Bot xotirasi saqlanmaydi!");
    return;
  }
  
  try {
    await mongoose.connect(mongoUri);
    console.log('✅ MongoDB muvaffaqiyatli ulandi!');
  } catch (error) {
    console.error('❌ MongoDB ulanishida xatolik:', error);
  }
}
