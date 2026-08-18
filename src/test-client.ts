import dotenv from 'dotenv';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { NewMessage } from 'telegram/events/index.js';

dotenv.config();

async function run() {
  const apiId = parseInt(process.env.TELEGRAM_API_ID || '0');
  const apiHash = process.env.TELEGRAM_API_HASH || '';
  const session = process.env.TELEGRAM_SESSION || '';

  console.log('Testing with API ID:', apiId, 'Session length:', session.length);

  const client = new TelegramClient(new StringSession(session), apiId, apiHash, {
    connectionRetries: 5,
  });

  await client.connect();
  console.log('Connected to Telegram!');

  const me = await client.getMe();
  console.log('Me:', (me as any).firstName, 'ID:', (me as any).id);

  console.log('Listening for 30 seconds... Write a message to this account from another account!');

  client.addEventHandler((event: any) => {
    console.log('🔔 EVENT RECEIVED!');
    console.log('Message text:', event.message?.text);
    console.log('Is private:', event.isPrivate);
    console.log('Sender ID:', event.message?.senderId?.toString());
    console.log('Out (from me?):', event.message?.out);
  }, new NewMessage({}));

  setTimeout(async () => {
    console.log('Test completed.');
    await client.disconnect();
    process.exit(0);
  }, 30000);
}

run().catch(console.error);
