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

      output.print(`🔗 Adding Vercel MCP to Claude Code...\n`);
      const result = safeExecSync(
        `claude mcp add --transport http ${mcpName} ${mcpUrl}`
      );

      if (typeof result === 'object' && 'error' in result) {
        if (result.stderr?.includes('already exists')) {
          summary.push('✅ Claude Code: Vercel MCP already configured');
          output.print('ℹ️ Vercel MCP is already configured in Claude Code\n');
        } else {
          summary.push('❌ Claude Code: Failed to add MCP server');
          output.print('💡 Manual commands:\n');
          output.print(
            `   claude mcp add --transport http ${mcpName} ${mcpUrl}\n`
          );
          output.print(
            '   # Or use the /mcp command in Claude Code to authenticate\n'
          );
        }
      } else {
        summary.push('✅ Claude Code: Vercel MCP added successfully');
        output.print('✅ Successfully added Vercel MCP to Claude Code\n');
        output.print(
          'ℹ️ You may need to authenticate using the /mcp command in Claude Code\n'
        );
      }
    } else if (clientName === 'Claude.ai and Claude for desktop') {
      output.print(
        '🔗 Manual setup required for Claude.ai and Claude for desktop\n'
      );
      output.print('💡 Setup instructions:\n');
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
      summary.push('ℹ️ Claude.ai/Desktop: Manual setup required');
    } else if (clientName === 'Cursor') {
      output.print('🔗 Setting up Cursor MCP...\n');

      const mcpUrl = isProjectSpecific
        ? (await getProjectSpecificUrl(client))?.url
        : MCP_ENDPOINT;
      const serverName = isProjectSpecific
        ? `vercel-${(await getProjectSpecificUrl(client))?.projectName}`
        : 'vercel';

      // Create the one-click installer URL
      const config = {
        url: mcpUrl,
        name: serverName,
      };
      const configJson = JSON.stringify(config);
      const encodedConfig = Buffer.from(configJson).toString('base64');
      const oneClickUrl = `cursor://anysphere.cursor-deeplink/mcp/install?name=${serverName}&config=${encodedConfig}`;
      output.print(`🔗 Generated Cursor deep link: ${oneClickUrl}\n`);

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
        output.print('✅ Successfully opened Cursor one-click installer\n');
      } catch (error) {
        summary.push('⚠️ Cursor: Deep link may not have worked');
        output.print('⚠️ Deep link may not have opened Cursor settings\n');
      }

      // Always provide manual setup instructions as fallback
      output.print('💡 Manual setup (recommended):\n');
      output.print('   1. Open Cursor\n');
      output.print('   2. Go to Settings (Cmd+, / Ctrl+,)\n');
      output.print('   3. Navigate to MCP section\n');
      output.print('   4. Click "Add Server"\n');
      output.print('   5. Enter the following details:\n');
      output.print(`      • Name: ${serverName}\n`);
      output.print(`      • URL: ${mcpUrl}\n`);
      output.print('   6. Click "Add" and follow the authorization prompts\n');
      output.print('\n');
      output.print('   Or try the deep link manually:\n');
      output.print(`   ${oneClickUrl}\n`);
      output.print('   (Copy and paste this URL in your browser)\n');
    } else if (clientName === 'VS Code with Copilot') {
      // Check if GitHub Copilot is installed
      output.print('🔍 Checking for GitHub Copilot...\n');
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
      } else {
        output.print('✅ GitHub Copilot detected\n');
      }

      output.print('🔗 Setting up Vercel MCP in VS Code...\n');

      const mcpUrl = isProjectSpecific
        ? (await getProjectSpecificUrl(client))?.url
        : MCP_ENDPOINT;
      const serverName = isProjectSpecific
        ? `vercel-${(await getProjectSpecificUrl(client))?.projectName}`
        : 'vercel';

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
        output.print('✅ Successfully opened VS Code one-click installer\n');
        output.print('ℹ️ Follow the prompts in VS Code to complete setup\n');
        output.print(
          'ℹ️ You may need to authorize the connection when prompted\n'
        );
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
        output.print('\n');
        output.print('   Or use the one-click installer manually:\n');
        output.print(`   ${oneClickUrl}\n`);
      }
    }

    output.print('─'.repeat(50) + '\n');
  }

  output.print('📊 Setup Summary\n');
  output.print('─'.repeat(50) + '\n');
  summary.forEach(line => output.print(`${line}\n`));

  if (isProjectSpecific) {
    const projectInfo = await getProjectSpecificUrl(client);
    output.print(`🔗 Project-specific MCP URL: ${projectInfo?.url}\n`);
  }

  output.print(
    '🔗 Official documentation: https://vercel.com/docs/mcp/vercel-mcp\n'
  );
  output.print(`🔒 Official endpoint: ${MCP_ENDPOINT}\n`);
  output.print('✨ Setup complete! Restart your clients if needed.\n');

  return 0;
}
