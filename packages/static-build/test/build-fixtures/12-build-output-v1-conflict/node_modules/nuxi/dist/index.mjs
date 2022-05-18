import { m as mri, c as commands } from './chunks/index.mjs';

async function runCommand(command, argv = process.argv.slice(2)) {
  const args = mri(argv);
  args.clear = false;
  const cmd = await commands[command]();
  if (!cmd) {
    throw new Error(`Invalid command ${command}`);
  }
  await cmd.invoke(args);
}

export { runCommand };
