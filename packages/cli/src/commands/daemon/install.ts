import { execSync, spawnSync } from 'child_process';
import { join } from 'path';
import { homedir, platform } from 'os';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import output from '../../output-manager';
import { daemonCommand } from './command';

function getUserDataDir(): string | null {
  if (process.env.XDG_DATA_HOME) {
    return process.env.XDG_DATA_HOME;
  }
  switch (platform()) {
    case 'darwin':
      return join(homedir(), 'Library/Application Support');
    case 'linux':
      return join(homedir(), '.local/share');
    case 'win32':
      if (process.env.LOCALAPPDATA) {
        return process.env.LOCALAPPDATA;
      }
      return null;
    default:
      return null;
  }
}

function installMacOS(
  daemonPath: string,
  logPath: string,
  autoStart: boolean
): void {
  const plistPath = join(
    homedir(),
    'Library/LaunchAgents/com.vercel.daemon.plist'
  );

  const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.vercel.daemon</string>
  <key>ProgramArguments</key>
  <array>
    <string>${process.execPath}</string>
    <string>${daemonPath}</string>
  </array>
  <key>ProcessType</key>
  <string>Background</string>
  <key>Nice</key>
  <integer>0</integer>
  <key>RunAtLoad</key>
  <${autoStart ? 'true' : 'false'}/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <key>StandardOutPath</key>
  <string>${logPath}</string>
  <key>StandardErrorPath</key>
  <string>${logPath}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>VERCEL_DAEMON</key>
    <string>1</string>
  </dict>
</dict>
</plist>`;

  // Ensure LaunchAgents directory exists
  const launchAgentsDir = join(homedir(), 'Library/LaunchAgents');
  if (!existsSync(launchAgentsDir)) {
    mkdirSync(launchAgentsDir, { recursive: true });
  }

  // Write plist file
  writeFileSync(plistPath, plistContent);
  output.log(`Created launchd configuration at ${plistPath}`);

  // Load the service
  try {
    execSync(`launchctl load ${plistPath}`, { stdio: 'inherit' });
    output.log('Daemon service installed and loaded');
  } catch (err) {
    output.warn(
      'Failed to load service automatically. You can load it manually with:'
    );
    output.log(`  launchctl load ${plistPath}`);
  }
}

function installLinux(
  daemonPath: string,
  logPath: string,
  autoStart: boolean
): void {
  const unitDir = join(homedir(), '.config/systemd/user');
  const unitPath = join(unitDir, 'vercel-daemon.service');

  const unitContent = `[Unit]
Description=Vercel Token Refresh Daemon
After=network.target

[Service]
Type=simple
ExecStart=${process.execPath} ${daemonPath}
Restart=on-failure
RestartSec=10
StandardOutput=append:${logPath}
StandardError=append:${logPath}

[Install]
WantedBy=default.target
`;

  // Ensure systemd user directory exists
  if (!existsSync(unitDir)) {
    mkdirSync(unitDir, { recursive: true });
  }

  // Write unit file
  writeFileSync(unitPath, unitContent);
  output.log(`Created systemd unit at ${unitPath}`);

  // Reload systemd
  try {
    execSync('systemctl --user daemon-reload', { stdio: 'inherit' });

    if (autoStart) {
      execSync('systemctl --user enable vercel-daemon', { stdio: 'inherit' });
      output.log('Daemon service installed and enabled');
    } else {
      output.log('Daemon service installed (not enabled for auto-start)');
    }
  } catch (err) {
    output.warn(
      'Failed to configure service automatically. You can configure it manually with:'
    );
    output.log('  systemctl --user daemon-reload');
    if (autoStart) {
      output.log('  systemctl --user enable vercel-daemon');
    }
  }
}

function installWindows(daemonPath: string, autoStart: boolean): void {
  const taskName = 'VercelTokenDaemon';
  const command = `"${process.execPath}" "${daemonPath}"`;

  try {
    if (autoStart) {
      // Create task that runs on user logon
      spawnSync(
        'schtasks',
        ['/create', '/tn', taskName, '/tr', command, '/sc', 'ONLOGON', '/f'],
        { stdio: 'inherit' }
      );
    } else {
      // Create task but don't set trigger
      spawnSync(
        'schtasks',
        [
          '/create',
          '/tn',
          taskName,
          '/tr',
          command,
          '/sc',
          'ONCE',
          '/st',
          '00:00',
          '/f',
        ],
        { stdio: 'inherit' }
      );
    }
    output.log('Daemon service installed');
  } catch (err) {
    output.error('Failed to install Windows scheduled task');
    throw err;
  }
}

export default async function install(
  client: Client,
  args: string[]
): Promise<number> {
  const installSubcommand = daemonCommand.subcommands!.find(
    sub => sub.name === 'install'
  )!;

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(installSubcommand.options);

  try {
    parsedArgs = parseArguments(args, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const autoStart = parsedArgs.flags['--auto-start'] !== false;

  // Find daemon executable
  const daemonPath = join(__dirname, 'vercel-daemon.js');

  if (!existsSync(daemonPath)) {
    output.error(`Daemon executable not found at ${daemonPath}`);
    return 1;
  }

  // Get log path
  const dataDir = getUserDataDir();
  if (!dataDir) {
    output.error('Unable to determine user data directory');
    return 1;
  }

  const logDir = join(dataDir, 'com.vercel.cli', 'logs');
  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true, mode: 0o770 });
  }
  const logPath = join(logDir, 'daemon.log');

  output.log('Installing daemon service...');

  try {
    switch (platform()) {
      case 'darwin':
        installMacOS(daemonPath, logPath, autoStart);
        break;
      case 'linux':
        installLinux(daemonPath, logPath, autoStart);
        break;
      case 'win32':
        installWindows(daemonPath, autoStart);
        break;
      default:
        output.error(`Unsupported platform: ${platform()}`);
        return 1;
    }

    output.log('');
    output.log('Daemon service installed successfully!');
    output.log('');
    output.log('Start the daemon with:');
    output.log('  vercel daemon start');
    output.log('');
    output.log('Check status with:');
    output.log('  vercel daemon status');

    return 0;
  } catch (err) {
    output.error(
      `Failed to install daemon: ${err instanceof Error ? err.message : String(err)}`
    );
    return 1;
  }
}
