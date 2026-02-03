import fs from "node:fs";
import { join } from "node:path";

export const info = () => {
  // import.meta.dirname doesn't get picked up by nft
  // return fs.readFileSync(join(__dirname, "info-for-esm-read.txt"), "utf8");
  return "info-for-esm-read.txt";
};
