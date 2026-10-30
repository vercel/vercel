import output from '../../output-manager';
import type Client from '../../util/client';
import { execFileSync } from 'child_process';
import { getLinkedProject } from '../../util/projects/link';
import { packageName } from '../../util/pkg-name';
import { outputAgentError } from '../../util/agent-output';

const MCP_ENDPOINT = 'https://mcp.vercel.com';

export interface McpOptions {
  project?: boolean;
  clients?: string[];
}

function getAvailableClients(): string[] {
  return [
    'Claude Code',
    'Claude.ai and Claude for desktop',
    'Cursor',
    'VS Code with Copilot',
  ];
}

// Commands are executed without a shell so team-controlled values (project
// names) can never be interpreted as shell syntax or extra argv entries.
function safeExecFile(
  command: string,
  args: string[],
  options: any = {}
): string | { error: string; stderr: string } {
  try {
    const result = execFileSync(command, args, {
      stdio: 'pipe',
      encoding: 'utf8',
      ...options,
    });
    return typeof result === 'string' ? result : result.toString('utf8');
  } catch (error: any) {
    return { error: error.message, stderr: error.stderr?.toString() || '' };
  }
}

// MCP clients expect a simple server identifier and project names are
// team-controlled, so the derived name is restricted to a safe character set.
// The project's case is preserved so an existing server entry keeps matching.
function getServerName(projectName?: string): string {
  if (!projectName) {
    return 'vercel';
  }
  const safe = projectName.replace(/[^A-Za-z0-9._-]+/g, '-');
  return safe ? `vercel-${safe}` : 'vercel';
}

// The names and URLs below are the only dynamic values that reach a Windows
// command line, so they are matched against the exact character sets produced
// by getServerName and getProjectSpecificUrl before cmd is involved.
const WINDOWS_SAFE_SERVER_NAME = /^[A-Za-z0-9._-]+$/;
const WINDOWS_SAFE_URL = /^https:\/\/[A-Za-z0-9._~%/:-]+$/;

// On Windows the MCP clients and CLI helpers are .cmd shims, which
// execFileSync cannot run without a shell (EINVAL since the CVE-2024-27980
// hardening). They are invoked through cmd with verbatim arguments, so the
// command line is passed as a single pre-quoted element that cmd never
// re-quotes; callers must only pass values validated above.
function safeExecWindowsCommand(
  commandLine: string
): string | { error: string; stderr: string } {
  return safeExecFile('cmd', ['/d', '/s', '/c', commandLine], {
    windowsVerbatimArguments: true,
  });
}

// Hands a deep link to the platform opener as a single argv element, so the
// URL is never parsed by a shell. Returns false when the opener failed.
function openUrl(url: string): boolean {
  const result =
    process.platform === 'darwin'
      ? safeExecFile('open', [url])
      : process.platform === 'win32'
        ? // `start` is a cmd builtin and its first argument is the window
          // title. Verbatim arguments pass the command line through as written,
          // so the URL stays inside the quotes and its `&` cannot split the
          // command; this is safe because every dynamic segment is
          // percent-encoded or base64 (no quotes can appear in the URL).
          safeExecWindowsCommand(`start "" "${url}"`)
        : safeExecFile('xdg-open', [url]);
  return typeof result === 'string';
}

// Registers the MCP server with Claude Code. On Windows `claude` is a .cmd
// shim, so it is run through cmd after the two dynamic values have been
// checked against the charset produced by getServerName/getProjectSpecificUrl.
function addClaudeMcpServer(
  mcpName: string,
  mcpUrl: string
): string | { error: string; stderr: string } {
  if (process.platform !== 'win32') {
    return safeExecFile('claude', [
      'mcp',
      'add',
      '--transport',
      'http',
      mcpName,
      mcpUrl,
    ]);
  }
  if (
    !WINDOWS_SAFE_SERVER_NAME.test(mcpName) ||
    !WINDOWS_SAFE_URL.test(mcpUrl)
  ) {
    return {
      error: 'refusing to run claude with unsafe arguments',
      stderr: '',
    };
  }
  return safeExecWindowsCommand(
    `claude mcp add --transport http ${mcpName} ${mcpUrl}`
  );
}

// Lists the installed VS Code extensions. `code` is a .cmd shim on Windows and
// the command carries no dynamic values, so cmd is safe there.
function listVSCodeExtensions(): string | { error: string; stderr: string } {
  if (process.platform === 'win32') {
    return safeExecWindowsCommand('code --list-extensions');
  }
  return safeExecFile('code', ['--list-extensions']);
}

async function getProjectSpecificUrl(
  client: Client
): Promise<{ url: string; projectName: string } | null> {
  try {
    const linkedProject = await getLinkedProject(client);

    if (
      linkedProject.status !== 'linked' ||
      !linkedProject.org ||
      !linkedProject.project
    ) {
      return null;
    }

    const { org, project } = linkedProject;
    return {
      url: `${MCP_ENDPOINT}/${encodeURIComponent(
        org.slug
      )}/${encodeURIComponent(project.name)}`,
      projectName: project.name,
    };
  } catch (_error) {
    return null;
  }
}

export default async function mcp(client: Client, opts: McpOptions = {}) {
  const isProjectSpecific = opts.project ?? client.argv.includes('--project');

  if (!client.nonInteractive) {
    output.print('🚀 Vercel MCP Setup — Automated\n');
  }

  if (isProjectSpecific) {
    if (!client.nonInteractive) {
      output.print('🔗 Setting up project-specific MCP access...\n');
    }

    const projectInfo = await getProjectSpecificUrl(client);
    if (!projectInfo) {
      if (client.nonInteractive) {
        outputAgentError(
          client,
          {
            status: 'error',
            reason: 'not_linked',
            message:
              'No linked project found. Link your project first for project-specific MCP.',
            next: [{ command: `${packageName} link` }],
          },
          1
        );
      }
      output.print(
        '❌ No linked project found. Please link your project first:\n'
      );
      output.print('   vercel link\n');
      return 1;
    }

    if (!client.nonInteractive) {
      output.print(`✅ Project-specific URL: ${projectInfo.url}\n`);
      output.print(
        'This URL will automatically provide project and team context.\n\n'
      );
    }
  }

  const availableClients = getAvailableClients();
  let selectedClients: string[];

  // --clients is honored in both interactive and non-interactive mode when
  // provided and valid (non-interactive still requires it; see index.ts).
  if (opts.clients && opts.clients.length > 0) {
    const invalid = opts.clients.filter(
      name => !availableClients.includes(name)
    );
    if (invalid.length > 0) {
      if (client.nonInteractive) {
        outputAgentError(
          client,
          {
            status: 'error',
            reason: 'invalid_clients',
            message: `Invalid client(s): ${invalid.join(
              ', '
            )}. Valid options: ${availableClients.join(', ')}.`,
          },
          2
        );
      }
      output.error(
        `Invalid client(s): ${invalid.join(
          ', '
        )}. Valid options: ${availableClients.join(', ')}.`
      );
      return 2;
    }
    selectedClients = opts.clients;
    if (!client.nonInteractive) {
      output.print(
        `Using clients from --clients: ${selectedClients.join(', ')}\n\n`
      );
    }
  } else {
    selectedClients = await client.input.checkbox({
      message: 'Select MCP clients to set up:',
      choices: availableClients.map((name: string) => ({
        name,
        value: name,
        short: name,
      })),
    });
  }

  if (!Array.isArray(selectedClients) || selectedClients.length === 0) {
    if (client.nonInteractive) {
      client.stdout.write(
        `${JSON.stringify(
          {
            status: 'ok',
            summary: [],
            message: 'No clients selected.',
          },
          null,
          2
        )}\n`
      );
      return 0;
    }
    output.print('\nNo clients selected. Exiting.\n');
    return 0;
  }

  const summary: string[] = [];
  if (!client.nonInteractive) {
    output.print('\nStarting setup...\n');
  }

  for (const clientName of selectedClients) {
    if (!client.nonInteractive) {
      output.print(`🔧 Setting up ${clientName}...\n`);
    }

    if (clientName === 'Claude Code') {
      const claudeProjectInfo = isProjectSpecific
        ? await getProjectSpecificUrl(client)
        : null;
      const mcpUrl = claudeProjectInfo?.url ?? MCP_ENDPOINT;
      const mcpName = claudeProjectInfo
        ? getServerName(claudeProjectInfo.projectName)
        : 'vercel';

      const result = addClaudeMcpServer(mcpName, mcpUrl);

      if (typeof result === 'object' && 'error' in result) {
        if (result.stderr?.includes('already exists')) {
          summary.push('✅ Claude Code: Vercel MCP already configured');
          if (!client.nonInteractive) {
            output.print(
              'ℹ️  Vercel MCP is already configured in Claude Code\n'
            );
            output.print('─'.repeat(50) + '\n');
          }
        } else {
          summary.push('❌ Claude Code: Failed to add MCP server');
          if (!client.nonInteractive) {
            output.print('💡 Manual setup required:\n');
            output.print(
              `   claude mcp add --transport http ${mcpName} ${mcpUrl}\n`
            );
            output.print(
              '   # Or use the /mcp command in Claude Code to authenticate\n'
            );
            output.print('─'.repeat(50) + '\n');
          }
        }
      } else {
        summary.push('✅ Claude Code: Vercel MCP added successfully');
        if (!client.nonInteractive) {
          output.print('✅ Successfully added Vercel MCP to Claude Code\n');
          output.print(
            'ℹ️ You may need to authenticate using the /mcp command in Claude Code\n'
          );
          output.print('─'.repeat(50) + '\n');
        }
      }
    } else if (clientName === 'Claude.ai and Claude for desktop') {
      if (!client.nonInteractive) {
        output.print(
          '💡 Manual setup required for Claude.ai and Claude for desktop\n'
        );
        output.print('   1. Open Settings in the sidebar\n');
        output.print(
          '   2. Navigate to Connectors and select Add custom connector\n'
        );
        output.print('   3. Configure the connector:\n');
        if (isProjectSpecific) {
          const projectInfo = await getProjectSpecificUrl(client);
          const projectName = projectInfo?.projectName || 'project';
          output.print(`      • Name: Vercel ${projectName}\n`);
          output.print(`      • URL: ${projectInfo?.url}\n`);
        } else {
          output.print('      • Name: Vercel\n');
          output.print(`      • URL: ${MCP_ENDPOINT}\n`);
        }
        output.print('   4. Complete the authentication flow\n');
      }
      summary.push('ℹ️  Claude.ai/Desktop: Manual setup required');
      if (!client.nonInteractive) {
        output.print('─'.repeat(50) + '\n');
      }
    } else if (clientName === 'Cursor') {
      // Check if Cursor is installed
      const cursorCheck = safeExecFile(
        process.platform === 'darwin'
          ? 'ls'
          : process.platform === 'win32'
            ? 'where'
            : 'which',
        [process.platform === 'darwin' ? '/Applications/Cursor.app' : 'cursor']
      );

      if (typeof cursorCheck === 'object' && 'error' in cursorCheck) {
        if (!client.nonInteractive) {
          output.print('⚠️ Cursor not detected. Please install Cursor first.\n');
          output.print('   Download from: https://cursor.sh\n');
          output.print('\n');
        }
        summary.push('⚠️ Cursor: Not installed');
        if (!client.nonInteractive) {
          output.print('─'.repeat(50) + '\n');
        }
        continue;
      }

      const cursorProjectInfo = isProjectSpecific
        ? await getProjectSpecificUrl(client)
        : null;
      const mcpUrl = cursorProjectInfo?.url ?? MCP_ENDPOINT;
      const serverName = cursorProjectInfo
        ? getServerName(cursorProjectInfo.projectName)
        : 'vercel';

      // Check if Vercel MCP is already configured in Cursor
      const cursorConfigPath =
        process.platform === 'darwin'
          ? `${process.env.HOME}/Library/Application Support/Cursor/User/settings.json`
          : process.platform === 'win32'
            ? `${process.env.APPDATA}/Cursor/User/settings.json`
            : `${process.env.HOME}/.config/Cursor/User/settings.json`;

      const cursorMcpPath =
        process.platform === 'darwin'
          ? `${process.env.HOME}/.cursor/mcp.json`
          : process.platform === 'win32'
            ? `${process.env.APPDATA}/Cursor/mcp.json`
            : `${process.env.HOME}/.cursor/mcp.json`;

      let cursorAlreadyConfigured = false;
      try {
        const fs = require('fs');

        // Check ~/.cursor/mcp.json first (Cursor's primary MCP config file)
        if (fs.existsSync(cursorMcpPath)) {
          const configContent = fs.readFileSync(cursorMcpPath, 'utf8');
          const config = JSON.parse(configContent);
          const mcpServers = config.mcpServers || {};
          cursorAlreadyConfigured = Object.values(mcpServers).some(
            (server: any) =>
              server.url === mcpUrl || server.url === MCP_ENDPOINT
          );
        }

        // Check settings.json if mcp.json doesn't exist or doesn't have the server
        if (!cursorAlreadyConfigured && fs.existsSync(cursorConfigPath)) {
          const configContent = fs.readFileSync(cursorConfigPath, 'utf8');
          const config = JSON.parse(configContent);
          const mcpServers = config['mcp.servers'] || {};
          cursorAlreadyConfigured = Object.values(mcpServers).some(
            (server: any) =>
              server.url === mcpUrl || server.url === MCP_ENDPOINT
          );
        }
      } catch (_error) {
        // If we can't read the config, assume it's not configured
      }

      if (cursorAlreadyConfigured) {
        summary.push('✅ Cursor: Vercel MCP already configured');
        if (!client.nonInteractive) {
          output.print('ℹ️  Vercel MCP is already configured in Cursor\n');
          output.print('─'.repeat(50) + '\n');
        }
        continue;
      }

      // Create the one-click installer URL
      const config = {
        url: mcpUrl,
        name: serverName,
      };
      const configJson = JSON.stringify(config);
      const encodedConfig = Buffer.from(configJson).toString('base64');
      const encodedServerName = encodeURIComponent(serverName);
      const oneClickUrl = `cursor://anysphere.cursor-deeplink/mcp/install?name=${encodedServerName}&config=${encodedConfig}`;

      // Try to open the one-click installer
      try {
        if (!openUrl(oneClickUrl)) {
          throw new Error('failed to open the one-click installer');
        }

        summary.push('✅ Cursor: One-click installer opened');
        if (!client.nonInteractive) {
          output.print('ℹ️  Follow the prompts in Cursor to complete setup\n');
        }
      } catch (_error) {
        summary.push('⚠️ Cursor: Deep link may not have worked');
        if (!client.nonInteractive) {
          output.print('⚠️ Could not open Cursor automatically\n');
          output.print('💡 Manual setup:\n');
          output.print('   1. Open Cursor\n');
          output.print('   2. Go to Settings (Cmd+, / Ctrl+,)\n');
          output.print('   3. Navigate to MCP section\n');
          output.print('   4. Click "Add Server"\n');
          output.print('   5. Enter the following details:\n');
          output.print(`      • Name: ${serverName}\n`);
          output.print(`      • URL: ${mcpUrl}\n`);
          output.print(
            '   6. Click "Add" and follow the authorization prompts\n'
          );
          output.print('─'.repeat(50) + '\n');
        }
      }
    } else if (clientName === 'VS Code with Copilot') {
      // Check if GitHub Copilot is installed
      // List extensions without a shell and filter in-process instead of
      // piping through grep.
      const copilotCheck = listVSCodeExtensions();
      const hasCopilot =
        typeof copilotCheck === 'string' && /copilot/i.test(copilotCheck);

      if (!hasCopilot) {
        if (!client.nonInteractive) {
          output.print(
            '⚠️ GitHub Copilot not detected. MCP functionality may be limited.\n'
          );
          output.print('   1. Open VS Code\n');
          output.print('   2. Go to Extensions (Cmd+Shift+X / Ctrl+Shift+X)\n');
          output.print('   3. Search for "GitHub Copilot"\n');
          output.print(
            '   4. Install and authenticate with your GitHub account\n'
          );
          output.print('   5. Restart VS Code\n');
          output.print('\n');
        }
      }

      const vscodeProjectInfo = isProjectSpecific
        ? await getProjectSpecificUrl(client)
        : null;
      const mcpUrl = vscodeProjectInfo?.url ?? MCP_ENDPOINT;
      const serverName = vscodeProjectInfo
        ? getServerName(vscodeProjectInfo.projectName)
        : 'vercel';

      // Check if Vercel MCP is already configured in VS Code
      const vscodeConfigPath =
        process.platform === 'darwin'
          ? `${process.env.HOME}/Library/Application Support/Code/User/settings.json`
          : process.platform === 'win32'
            ? `${process.env.APPDATA}/Code/User/settings.json`
            : `${process.env.HOME}/.config/Code/User/settings.json`;

      const vscodeMcpPath =
        process.platform === 'darwin'
          ? `${process.env.HOME}/Library/Application Support/Code/User/mcp.json`
          : process.platform === 'win32'
            ? `${process.env.APPDATA}/Code/User/mcp.json`
            : `${process.env.HOME}/.config/Code/User/mcp.json`;

      let vscodeAlreadyConfigured = false;
      try {
        const fs = require('fs');

        // Check mcp.json first (primary MCP config file)
        if (fs.existsSync(vscodeMcpPath)) {
          const configContent = fs.readFileSync(vscodeMcpPath, 'utf8');
          const config = JSON.parse(configContent);
          const mcpServers = config.servers || {};
          vscodeAlreadyConfigured = Object.values(mcpServers).some(
            (server: any) =>
              server.url === mcpUrl || server.url === MCP_ENDPOINT
          );
        }

        // Check settings.json if mcp.json doesn't exist or doesn't have the server
        if (!vscodeAlreadyConfigured && fs.existsSync(vscodeConfigPath)) {
          const configContent = fs.readFileSync(vscodeConfigPath, 'utf8');
          const config = JSON.parse(configContent);
          const mcpServers = config['mcp.servers'] || {};
          vscodeAlreadyConfigured = Object.values(mcpServers).some(
            (server: any) =>
              server.url === mcpUrl || server.url === MCP_ENDPOINT
          );
        }
      } catch (_error) {
        // If we can't read the config, assume it's not configured
      }

      if (vscodeAlreadyConfigured) {
        summary.push('✅ VS Code: Vercel MCP already configured');
        if (!client.nonInteractive) {
          output.print('ℹ️  Vercel MCP is already configured in VS Code\n');
          output.print('─'.repeat(50) + '\n');
        }
        continue;
      }

      // Create the one-click installer URL
      const config = {
        name: serverName,
        url: mcpUrl,
      };
      const encodedConfig = encodeURIComponent(JSON.stringify(config));
      const oneClickUrl = `vscode:mcp/install?${encodedConfig}`;

      try {
        // Try to open the one-click installer
        if (!openUrl(oneClickUrl)) {
          throw new Error('failed to open the one-click installer');
        }

        summary.push('✅ VS Code: One-click installer opened');
        if (!client.nonInteractive) {
          output.print('ℹ️  Follow the prompts in VS Code to complete setup\n');
        }
      } catch (_error) {
        summary.push('❌ VS Code: Failed to open one-click installer');
        if (!client.nonInteractive) {
          output.print('💡 Manual setup instructions:\n');
          output.print('   1. Open VS Code\n');
          output.print(
            '   2. Press Cmd+Shift+P (Mac) or Ctrl+Shift+P (Windows/Linux)\n'
          );
          output.print('   3. Type "MCP: Add Server" and press Enter\n');
          output.print('   4. Select HTTP\n');
          output.print('   5. Enter the following details:\n');
          output.print(`      • URL: ${mcpUrl}\n`);
          output.print(`      • Name: ${serverName}\n`);
          output.print(
            '   6. Select Global or Workspace depending on your needs\n'
          );
          output.print('   7. Click Add\n');
          output.print('   8. Follow the authorization steps\n');
          output.print('─'.repeat(50) + '\n');
        }
      }
    }
  }

  if (client.nonInteractive) {
    const jsonOutput: Record<string, unknown> = {
      status: 'ok',
      summary,
      hint: 'Complete any required setup and authentication in the selected MCP clients. Restart configured clients if needed.',
      next: [
        {
          command: `${packageName} link`,
          when: 'To link a project for project-specific MCP (optional)',
        },
      ],
    };
    client.stdout.write(`${JSON.stringify(jsonOutput, null, 2)}\n`);
    return 0;
  }

  output.print('📊 Setup Summary\n');
  output.print('─'.repeat(50) + '\n');
  summary.forEach(line => output.print(`${line}\n`));

  output.print(
    'Complete any required setup and authentication in the selected MCP clients. Restart configured clients if needed.\n'
  );

  return 0;
}
