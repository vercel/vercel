import { c as cyan } from './index2.mjs';
import { s as showHelp } from './help.mjs';
import { d as defineNuxtCommand, c as commands } from './index.mjs';
import 'tty';

const usage = defineNuxtCommand({
  meta: {
    name: "help",
    usage: "nuxt help",
    description: "Show help"
  },
  invoke(_args) {
    const sections = [];
    sections.push(`Usage: ${cyan(`npx nuxi ${Object.keys(commands).join("|")} [args]`)}`);
    console.log(sections.join("\n\n") + "\n");
    showHelp({});
  }
});

export { usage as default };
