import dotenv from 'dotenv';
dotenv.config();

import { connectDB, ChatStateModel, SettingModel } from './src/db.js';

async function check() {
  await connectDB();
  const chats = await ChatStateModel.find({});
  console.log('Muted chats in DB:', chats);
  
  const settings = await SettingModel.find({});
  console.log('Settings in DB:', settings);
  
  process.exit(0);
}

check();
