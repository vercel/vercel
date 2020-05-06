export default function debug(message: string, ...additional: any[]) {
  if (process.env.NOW_BUILDER_DEBUG || process.env.VERCEL_BUILDER_DEBUG) {
    console.log(message, ...additional);
  }
}
