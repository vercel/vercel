import output from '../../output-manager';
import type Client from '../../util/client';
import { execSync } from 'child_process';
import { getLinkedProject } from '../../util/projects/link';

const MCP_ENDPOINT = 'https://mcp.vercel.com';

function getAvailableClients(): string[] {
  return [
    'Claude Code',
    'Claude.ai and Claude for desktop',
    'Cursor',
    'VS Code with Copilot',
  ];
}

function safeExecSync(
  command: string,
  options: any = {}
): string | { error: string; stderr: string } {
  try {
    return execSync(command, {
      stdio: 'pipe',
      encoding: 'utf8',
      ...options,
    });
  } catch (error: any) {
    return { error: error.message, stderr: error.stderr?.toString() || '' };
  }
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
      url: `${MCP_ENDPOINT}/${org.slug}/${project.name}`,
      projectName: project.name,
    };
  } catch (error) {
    return null;
  }
}

export default async function mcp(client: Client) {
  output.print('🚀 Vercel MCP Setup — Automated\n');

  // Check if --project flag is used
  const isProjectSpecific = client.argv.includes('--project');

  if (isProjectSpecific) {
    output.print('🔗 Setting up project-specific MCP access...\n');

    const projectInfo = await getProjectSpecificUrl(client);
    if (!projectInfo) {
      output.print(
        '❌ No linked project found. Please link your project first:\n'
      );
      output.print('   vercel link\n');
      return 1;
    }

    output.print(`✅ Project-specific URL: ${projectInfo.url}\n`);
    output.print(
      'This URL will automatically provide project and team context.\n\n'
    );
  }

  const availableClients = getAvailableClients();

  const selectedClients = await client.input.checkbox({
    message: 'Select MCP clients to set up:',
    choices: availableClients.map((name: string) => ({
      name,
      value: name,
      short: name,
    })),
  });

  if (!Array.isArray(selectedClients) || selectedClients.length === 0) {
    output.print('\nNo clients selected. Exiting.\n');
    return 0;
  }

  const summary: string[] = [];
  output.print('\nStarting setup...\n');

  for (const clientName of selectedClients) {
    output.print(`🔧 Setting up ${clientName}...\n`);

    if (clientName === 'Claude Code') {
      const mcpUrl = isProjectSpecific
        ? (await getProjectSpecificUrl(client))?.url
        : MCP_ENDPOINT;
      const mcpName = isProjectSpecific
        ? `vercel-${(await getProjectSpecificUrl(client))?.projectName}`
        : 'vercel';

      const result = safeExecSync(
        `claude mcp add --transport http ${mcpName} ${mcpUrl}`
      );

      if (typeof result === 'object' && 'error' in result) {
        if (result.stderr?.includes('already exists')) {
          summary.push('✅ Claude Code: Vercel MCP already configured');
          output.print('ℹ️  Vercel MCP is already configured in Claude Code\n');
          output.print('─'.repeat(50) + '\n');
        } else {
          summary.push('❌ Claude Code: Failed to add MCP server');
          output.print('💡 Manual setup required:\n');
          output.print(
            `   claude mcp add --transport http ${mcpName} ${mcpUrl}\n`
          );
          output.print(
            '   # Or use the /mcp command in Claude Code to authenticate\n'
          );
          output.print('─'.repeat(50) + '\n');
        }
      } else {
        summary.push('✅ Claude Code: Vercel MCP added successfully');
        output.print('✅ Successfully added Vercel MCP to Claude Code\n');
        output.print(
          'ℹ️ You may need to authenticate using the /mcp command in Claude Code\n'
        );
        output.print('─'.repeat(50) + '\n');
      }
    } else if (clientName === 'Claude.ai and Claude for desktop') {
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
      summary.push('ℹ️  Claude.ai/Desktop: Manual setup required');
      output.print('─'.repeat(50) + '\n');
    } else if (clientName === 'Cursor') {
      // Check if Cursor is installed
      const cursorCheck = safeExecSync(
        process.platform === 'darwin'
          ? 'ls /Applications/Cursor.app'
          : process.platform === 'win32'
            ? 'where cursor'
            : 'which cursor'
      );

      if (typeof cursorCheck === 'object' && 'error' in cursorCheck) {
        output.print('⚠️ Cursor not detected. Please install Cursor first.\n');
        output.print('   Download from: https://cursor.sh\n');
        output.print('\n');
        summary.push('⚠️ Cursor: Not installed');
        output.print('─'.repeat(50) + '\n');
        continue;
      }

      const mcpUrl = isProjectSpecific
        ? (await getProjectSpecificUrl(client))?.url
        : MCP_ENDPOINT;
      const serverName = isProjectSpecific
        ? `vercel-${(await getProjectSpecificUrl(client))?.projectName}`
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
      } catch (error) {
        // If we can't read the config, assume it's not configured
      }

      if (cursorAlreadyConfigured) {
        summary.push('✅ Cursor: Vercel MCP already configured');
        output.print('ℹ️  Vercel MCP is already configured in Cursor\n');
        output.print('─'.repeat(50) + '\n');
        continue;
      }

      // Create the one-click installer URL
      const config = {
        url: mcpUrl,
        name: serverName,
      };
      const configJson = JSON.stringify(config);
      const encodedConfig = Buffer.from(configJson).toString('base64');
      const oneClickUrl = `cursor://anysphere.cursor-deeplink/mcp/install?name=${serverName}&config=${encodedConfig}`;

      // Try to open the one-click installer
      try {
        if (process.platform === 'darwin') {
          execSync(`open '${oneClickUrl}'`);
        } else if (process.platform === 'win32') {
          execSync(`start ${oneClickUrl}`);
        } else {
          execSync(`xdg-open '${oneClickUrl}'`);
        }

        summary.push('✅ Cursor: One-click installer opened');
        output.print('ℹ️  Follow the prompts in Cursor to complete setup\n');
      } catch (error) {
        summary.push('⚠️ Cursor: Deep link may not have worked');
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
    } else if (clientName === 'VS Code with Copilot') {
      // Check if GitHub Copilot is installed
      const copilotCheck = safeExecSync(
        'code --list-extensions | grep -i copilot'
      );

      if (typeof copilotCheck === 'object' && 'error' in copilotCheck) {
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

      const mcpUrl = isProjectSpecific
        ? (await getProjectSpecificUrl(client))?.url
        : MCP_ENDPOINT;
      const serverName = isProjectSpecific
        ? `vercel-${(await getProjectSpecificUrl(client))?.projectName}`
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
      } catch (error) {
        // If we can't read the config, assume it's not configured
      }

      if (vscodeAlreadyConfigured) {
        summary.push('✅ VS Code: Vercel MCP already configured');
        output.print('ℹ️  Vercel MCP is already configured in VS Code\n');
        output.print('─'.repeat(50) + '\n');
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
        if (process.platform === 'darwin') {
          execSync(`open '${oneClickUrl}'`);
        } else if (process.platform === 'win32') {
          execSync(`start ${oneClickUrl}`);
        } else {
          execSync(`xdg-open '${oneClickUrl}'`);
        }

        summary.push('✅ VS Code: One-click installer opened');
        output.print('ℹ️  Follow the prompts in VS Code to complete setup\n');
      } catch (error) {
        summary.push('❌ VS Code: Failed to open one-click installer');
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

  output.print('📊 Setup Summary\n');
  output.print('─'.repeat(50) + '\n');
  summary.forEach(line => output.print(`${line}\n`));

  output.print('✨ Setup complete! Restart your clients if needed.\n');

  return 0;
}
