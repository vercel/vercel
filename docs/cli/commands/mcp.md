# vercel mcp

Set up MCP (Model Context Protocol) agents and configuration for Vercel integration.

## Synopsis

```bash
vercel mcp [options]
```

## Description

The `mcp` command helps you configure Model Context Protocol (MCP) agents for AI-powered workflows with Vercel. MCP provides a standardized way for AI assistants to interact with your Vercel projects and deployments.

MCP enables:

- AI assistants to deploy and manage Vercel projects
- Automated code review and deployment workflows
- Project-aware AI interactions
- Secure, scoped access to Vercel resources

## Options

| Option      | Type    | Description                                               |
| ----------- | ------- | --------------------------------------------------------- |
| `--project` | Boolean | Set up project-specific MCP access for the linked project |

## Examples

### Interactive MCP Setup

```bash
vercel mcp
```

This launches an interactive wizard that guides you through:

1. Selecting MCP agent type
2. Configuring authentication
3. Setting up permissions
4. Generating configuration files

### Project-Specific MCP Access

```bash
vercel mcp --project
```

Sets up MCP configuration scoped to the currently linked project, providing:

- Limited access to only this project's resources
- Project-specific environment variables
- Deployment permissions for this project only

---

## MCP Configuration

### Configuration File

After setup, MCP configuration is typically stored in:

- **Global config**: `~/.vercel/mcp.json`
- **Project config**: `.vercel/mcp.json`

### Example Configuration

```json
{
  "version": 1,
  "agents": [
    {
      "name": "cursor",
      "type": "ide",
      "permissions": ["deploy", "env:read", "logs:read"],
      "projects": ["prj_abc123"]
    }
  ],
  "server": {
    "transport": "stdio"
  }
}
```

---

## Permission Scopes

| Permission      | Description                      |
| --------------- | -------------------------------- |
| `deploy`        | Create and manage deployments    |
| `env:read`      | Read environment variables       |
| `env:write`     | Modify environment variables     |
| `logs:read`     | Read deployment and runtime logs |
| `project:read`  | Read project settings            |
| `project:write` | Modify project settings          |
| `domain:read`   | Read domain configurations       |
| `domain:write`  | Modify domain configurations     |

---

## Agent Types

### IDE Agents

For AI-powered IDE integrations (Cursor, VS Code, etc.):

```bash
vercel mcp
# Select: IDE Agent
```

Configuration enables:

- Code deployment from IDE
- Environment variable access
- Log viewing
- Project management

### CI/CD Agents

For automated pipeline integrations:

```bash
vercel mcp
# Select: CI/CD Agent
```

Configuration enables:

- Automated deployments
- Status checks
- Webhook handling

### Custom Agents

For custom AI applications:

```bash
vercel mcp
# Select: Custom Agent
```

Provides flexible configuration for:

- Custom permission sets
- API access
- Token management

---

## Use Cases

### AI-Assisted Development

Set up MCP to allow your AI assistant to:

```bash
# Set up project-specific access
vercel mcp --project

# AI can now:
# - Deploy changes
# - Check deployment status
# - View logs
# - Read environment variables
```

### Automated Code Review Bot

```bash
# Set up with limited permissions
vercel mcp
# Select: CI/CD Agent
# Permissions: deploy, logs:read
```

### Multi-Project Management

```bash
# Global setup for multiple projects
vercel mcp
# Select: IDE Agent
# Scope: All projects in team
```

---

## Security Considerations

1. **Principle of Least Privilege**: Only grant permissions that are actually needed.

2. **Project Scoping**: Use `--project` for project-specific access when possible.

3. **Token Rotation**: Regularly rotate MCP tokens.

4. **Audit Access**: Monitor MCP agent activity in the Vercel Dashboard.

5. **Environment Separation**: Use separate MCP configurations for development and production.

---

## Integration Examples

### Cursor IDE

After running `vercel mcp`, add to Cursor settings:

```json
{
  "mcp": {
    "vercel": {
      "command": "vercel",
      "args": ["mcp", "serve"],
      "env": {
        "VERCEL_TOKEN": "${env:VERCEL_TOKEN}"
      }
    }
  }
}
```

### VS Code

Configure in VS Code settings:

```json
{
  "mcp.servers": {
    "vercel": {
      "command": "vercel",
      "args": ["mcp", "serve"]
    }
  }
}
```

---

## Troubleshooting

### "MCP configuration not found"

Run the setup wizard:

```bash
vercel mcp
```

### "Permission denied"

Ensure your Vercel token has sufficient permissions:

```bash
vercel logout
vercel login
vercel mcp --project
```

### "Project not linked"

Link your project first:

```bash
vercel link
vercel mcp --project
```

---

## See Also

- [login](login.md) - Authenticate with Vercel
- [link](link.md) - Link to a project
- [deploy](deploy.md) - Deploy your project
- [Model Context Protocol Documentation](https://modelcontextprotocol.io)
