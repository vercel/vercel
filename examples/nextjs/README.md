This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Skills

This project includes agent skills installed from [skills.sh](https://skills.sh) that enhance AI coding assistants with specialized knowledge:

- [`vercel-labs/skills`](https://skills.sh/vercel-labs/skills)
    - `find-skills`: Discover and install agent skills
- [`vercel-labs/agent-skills`](https://skills.sh/vercel-labs/agent-skills)
    - `vercel-composition-patterns`: Scalable React composition patterns
    - `vercel-react-best-practices`: React and Next.js performance optimization
    - `web-design-guidelines`: UI review for Web Interface Guidelines
- [`vercel-labs/next-skills`](https://skills.sh/vercel-labs/next-skills)
    - `next-best-practices`: Next.js conventions and patterns
    - `next-cache-components`: Next.js 16 PPR and `use cache` directive
    - `next-upgrade`: Upgrade Next.js with migration guides and codemods

### Platforms

The installed skills will work out-of-the-box with the following AI agents:

- [Amp](https://amp.dev) (Sourcegraph)
- [Claude Code](https://claude.ai/code) (Anthropic)
- [Codex](https://openai.com/index/introducing-codex/) (OpenAI)
- [Cursor](https://cursor.com) (Anysphere)
- [Gemini CLI](https://github.com/google-gemini/gemini-cli) (Google)
- [GitHub Copilot](https://github.com/features/copilot) (GitHub)
- [Kimi Code CLI](https://github.com/aspect-build/kimi-code) (Moonshot AI)
- [OpenCode](https://opencode.ai) (OpenCode AI)

Skills are designed to be platform-agnostic and can be used by any AI agent that can call external APIs.

### Find More Skills

Run `npx skills search` to find more skills that can help you with your Next.js project or any other development needs.

### Ask an Agent to Find Skills

The `find-skills` skill means you can ask an agent to find and install new skills on demand. 

For example:

```shell
> claude
> Find a skill that will help me use `ai-sdk` in my Next.js project.
✶ Cogitating… 
> vercel/ai@ai-sdk — This is the official AI SDK skill maintained by the Vercel team. Would you like to install it?
> Yes, please
```

### Create Your Own Skills

Run `npx skills init` to start creating your own agent skills. 

You can share them with the community by publishing to npm and adding to the [Skills Registry](https://skills.sh/explore).
