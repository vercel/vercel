# Next.js Example — AI Agent Documentation

## About This Example

This is a [Next.js](https://nextjs.org) example project located in the Vercel monorepo at `examples/nextjs/`. It serves as:

- **Reference implementation**: A standard Next.js app using the latest App Router features
- **Testing fixture**: Used for integration tests to validate Vercel platform behavior with Next.js deployments
- **Documentation example**: Demonstrates how to structure agent documentation for projects in this repository

This example is bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app) and uses modern Next.js features including:

- App Router architecture
- TypeScript support
- Tailwind CSS for styling
- ESLint configuration
- Font optimization with [Geist](https://vercel.com/font)

For basic usage instructions (running the dev server, building, etc.), see the [README.md](./README.md) file.

## AI Agent Skills Guide

This guide explains how to find, install, and use skills when working with AI agents on the Vercel platform.

## What are Skills?

Skills are structured documentation packages that teach AI agents (like Claude) how to use specific tools, CLIs, or systems. They provide:

- Command syntax and usage patterns
- Best practices and anti-patterns
- Decision trees for routing to the right commands
- Context-aware examples and references

Think of skills as specialized knowledge modules that enhance an AI agent's ability to work with specific tools effectively.

## Finding Skills

### In This Repository

Skills are located in the `/skills` directory at the repository root:

```
/skills
├── vercel-cli/
│   ├── SKILL.md              # Main skill entry point
│   ├── command/              # Command reference docs
│   └── references/           # Topic-specific guides
└── .claude/skills/           # Additional Claude-specific skills
```

### Available Skills

Currently available skills in this repository:

- **vercel-cli** (`/skills/vercel-cli/`): Complete guide to using the Vercel CLI for deployment, local development, environment management, and more

### Exploring a Skill

Each skill has a `SKILL.md` file that serves as the entry point:

```bash
cat /workspace/skills/vercel-cli/SKILL.md
```

The `SKILL.md` file typically includes:

- Skill metadata (name, description)
- Quick start guide
- Decision tree for routing to appropriate documentation
- Anti-patterns to avoid

## Installing Skills

### For Cursor/Claude Desktop

Skills in this repository are automatically available to AI agents working within the codebase. No installation required.

### For Custom Projects

To use these skills in your own projects:

1. **Copy the skill directory:**

```bash
cp -r /workspace/skills/vercel-cli /path/to/your/project/skills/
```

2. **Reference the skill in your `.claude/` directory:**

```bash
mkdir -p /path/to/your/project/.claude/skills/
ln -s ../../skills/vercel-cli/SKILL.md /path/to/your/project/.claude/skills/vercel-cli.md
```

3. **Create a CLAUDE.md file** (optional, for automatic discovery):

```bash
echo "@AGENTS.md" > /path/to/your/project/CLAUDE.md
```

## Using Skills

### With Claude/AI Agents

When working with an AI agent, you can reference skills directly:

- **Mention the skill**: "Use the vercel-cli skill to deploy this project"
- **Reference specific sections**: "Follow the deployment guide in the vercel-cli skill"
- **Let the agent discover**: Skills in the codebase are automatically available

### Manual Reference

You can also read skills manually for learning:

```bash
# View the main skill guide
cat /workspace/skills/vercel-cli/SKILL.md

# Browse specific topics
ls /workspace/skills/vercel-cli/references/

# Read a specific reference
cat /workspace/skills/vercel-cli/references/deployment.md
```

## Creating Your Own Skills

To create a new skill for your project:

1. **Create the skill directory:**

```bash
mkdir -p skills/my-tool
```

2. **Create the SKILL.md file:**

```markdown
---
name: my-tool
description: Brief description of what this skill helps with
---

# My Tool Skill

Quick overview and getting started guide...

## Decision Tree

- **Task type A** → `references/task-a.md`
- **Task type B** → `references/task-b.md`

## Anti-Patterns

- Common mistake 1
- Common mistake 2
```

3. **Add reference documentation:**

```bash
mkdir -p skills/my-tool/references
# Create detailed guides for specific topics
```

## Best Practices

### When Using Skills with AI Agents

- **Be specific**: Reference exact sections when you know what you need
- **Trust the decision tree**: Skills include routing logic for common tasks
- **Check anti-patterns first**: Save time by avoiding known pitfalls
- **Combine skills**: Use multiple skills together for complex tasks

### When Creating Skills

- **Focus on actionable content**: Commands, examples, and concrete steps
- **Include decision trees**: Help agents route to the right information
- **Document anti-patterns**: Teach what NOT to do
- **Keep it modular**: Split large skills into topical references
- **Use examples liberally**: Show, don't just tell

## Skill Structure Reference

Recommended structure for a well-organized skill:

```
skills/my-tool/
├── SKILL.md                    # Main entry point with metadata
├── command/                    # Command syntax reference
│   └── my-tool.md
├── references/                 # Topic-specific guides
│   ├── getting-started.md
│   ├── common-tasks.md
│   └── advanced.md
└── examples/                   # Optional: code examples
    └── basic-usage/
```

## Related Documentation

- Main repository agent guide: `/workspace/AGENTS.md`
- Vercel CLI skill: `/workspace/skills/vercel-cli/SKILL.md`
- Runtime implementation guide: `/workspace/.claude/skills/vercel-runtime-implementation-guide.md`

## Troubleshooting

### Agent isn't using the skill

- Verify the skill is in `/skills/` or `.claude/skills/`
- Check that `SKILL.md` has proper YAML frontmatter
- Reference the skill explicitly in your prompt

### Skill content is outdated

Skills should be maintained alongside the code they document. If you notice outdated content:

1. Update the relevant markdown files in the skill directory
2. Create a changeset if needed (see `/workspace/AGENTS.md`)
3. Submit a PR with the updates

## Additional Resources

- [Vercel Documentation](https://vercel.com/docs)
- [Next.js Documentation](https://nextjs.org/docs)
- [Claude Code Generation Best Practices](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/code-generation)
