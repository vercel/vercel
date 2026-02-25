import { execFile } from 'child_process';

export interface RefreshTokenOptions {
  /**
   * Team ID (team_*) or slug to use for token refresh.
   * When provided, this team will be used instead of reading from `.vercel/project.json`.
   */
  team?: string;
  /**
   * Project ID (prj_*) or slug to use for token refresh.
   * When provided, this project will be used instead of reading from `.vercel/project.json`.
   */
  project?: string;
  /**
   * Optional time buffer in milliseconds before token expiry to consider it expired.
   * When provided, the token will be refreshed if it expires within this buffer time.
   * @default 0
   */
  expirationBufferMs?: number;
}

export async function refreshToken(
  options?: RefreshTokenOptions
): Promise<void> {
  const args = ['project', 'token'];

  if (options?.project) {
    args.push(options.project);
  }

  if (options?.team) {
    args.push('--scope', options.team);
  }

  args.push('--yes');

  const token = await execVercelCli(args);
  process.env.VERCEL_OIDC_TOKEN = token.trim();
}

function execVercelCli(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('vercel', args, (error, stdout, stderr) => {
      if (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          reject(
            new Error(
              'Vercel CLI not found. Install it with `npm i -g vercel` and log in with `vercel login`.'
            )
          );
          return;
        }
        reject(
          new Error(`Failed to refresh OIDC token: ${stderr || error.message}`)
        );
        return;
      }
      resolve(stdout);
    });
  });
}
