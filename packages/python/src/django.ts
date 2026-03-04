import execa from 'execa';
import { debug } from '@vercel/build-utils';

export async function getDjangoSettings(
  settingsModule: string,
  cwd: string,
  env: NodeJS.ProcessEnv
): Promise<Record<string, unknown> | null> {
  const code = `
import importlib, json
mod = importlib.import_module("${settingsModule}")
settings = {k: getattr(mod, k) for k in dir(mod) if k.isupper()}
print(json.dumps(settings, default=str))
`.trim();
  try {
    const { stdout } = await execa('python', ['-c', code], { env, cwd });
    return JSON.parse(stdout);
  } catch (err) {
    debug(
      `Django hook: failed to load settings module ${settingsModule}: ${err}`
    );
    return null;
  }
}
