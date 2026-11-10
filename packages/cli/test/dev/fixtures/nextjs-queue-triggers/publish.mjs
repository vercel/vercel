import { send } from '@vercel/queue';

const { messageId } = await send(process.argv[2], JSON.parse(process.argv[3]));
console.log(JSON.stringify({ messageId, pid: process.pid }));
