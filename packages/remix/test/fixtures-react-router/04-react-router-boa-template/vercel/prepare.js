import * as fsp from "node:fs/promises";

await fsp.rm(".vercel", { recursive: true }).catch(() => {});
await fsp.mkdir(".vercel/output/static", { recursive: true });

await fsp.cp("vercel/output/", ".vercel/output", { recursive: true });
await fsp.cp("build/client/", ".vercel/output/static", { recursive: true });
await fsp.cp("build/server/", ".vercel/output/functions/index.func", {
  recursive: true,
});
