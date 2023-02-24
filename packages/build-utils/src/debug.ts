export default function debug(message: string) {
  if (process.env.VERCEL_DEBUG_PREFIX) {
    const line = message.replace(/\r?\n/g, ' ');
    console.log(`${process.env.VERCEL_DEBUG_PREFIX}${line}`);
  }
}
