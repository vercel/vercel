import { readFileSync } from 'fs';
import { join } from 'path';
import execa from 'execa';
import { debug } from '@vercel/build-utils';

const scriptPath = join(__dirname, '..', 'vc_django_settings.py');
const script = readFileSync(scriptPath, 'utf-8');

/**
 * Dynamically discover Django settings by running manage.py with a patched
 * `execute_from_command_line`. This lets manage.py set DJANGO_SETTINGS_MODULE
 * via whatever mechanism it uses (os.environ.setdefault, conditionals, etc.),
 * then we load that settings module and return all uppercase attributes.
 */
export async function getDjangoSettings(
  projectDir: string,
  env: NodeJS.ProcessEnv
): Promise<Record<string, unknown> | null> {
  try {
    const { stdout } = await execa('python', ['-c', script], {
      env,
      cwd: projectDir,
    });
    return JSON.parse(stdout);
  } catch (err) {
    debug(`Django hook: failed to discover settings from manage.py: ${err}`);
    return null;
  }
}
