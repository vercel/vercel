import { spawn } from 'node:child_process';
import { platform } from 'node:os';

/**
 * Best-effort native desktop notifications.
 *
 *   - macOS: osascript
 *   - Linux: notify-send (if available)
 *   - Windows: PowerShell BurntToast (only if installed) — otherwise no-op
 *
 * We don't take a dep on node-notifier etc. to keep this tool zero-install.
 */
export function createDesktopNotifier() {
  const os = platform();

  return {
    async notify(alert) {
      const title = alert.title || 'GitHub';
      const body = alert.url ? `${alert.body ? alert.body + '\n' : ''}${alert.url}` : alert.body || '';

      try {
        if (os === 'darwin') {
          await run('osascript', [
            '-e',
            `display notification ${escapeAppleScript(body)} with title ${escapeAppleScript(title)}`,
          ]);
        } else if (os === 'linux') {
          await run('notify-send', ['--', title, body]).catch(() => {
            // notify-send not installed; silently no-op.
          });
        } else if (os === 'win32') {
          const ps = `New-BurntToastNotification -Text '${escapeSingleQuotes(title)}','${escapeSingleQuotes(
            body
          )}'`;
          await run('powershell', ['-NoProfile', '-Command', ps]).catch(() => {});
        }
      } catch {
        // Never let a desktop-notification failure break the run.
      }
    },
  };
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'ignore' });
    p.on('error', reject);
    p.on('close', code => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });
}

function escapeAppleScript(s) {
  return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

function escapeSingleQuotes(s) {
  return String(s).replace(/'/g, "''");
}
