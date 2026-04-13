import fs from "node:fs";
import { join } from "node:path";

export const info = () => {
  return fs.readFileSync(join(__dirname, "info-for-esm-read.txt"), "utf8");
};
