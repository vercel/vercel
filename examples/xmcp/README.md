# xmcp Application

This project was created with [create-xmcp-app](https://github.com/basementstudio/xmcp).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

This will start the MCP server with the selected transport method.

## Project Structure

This project uses the structured approach where tools, prompts, and resources are automatically discovered from their respective directories:

- `src/tools` - Tool definitions
- `src/prompts` - Prompt templates
- `src/resources` - Resource handlers

### Tools

Each tool is defined in its own file with the following structure:

```typescript
import { z } from "zod";
import { type InferSchema, type ToolMetadata } from "xmcp";

export const schema = {
  name: z.string().describe("The name of the user to greet"),
};

export const metadata: ToolMetadata = {
  name: "greet",
  description: "Greet the user",
  annotations: {
    title: "Greet the user",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
  },
};

export default function greet({ name }: InferSchema<typeof schema>) {
  return `Hello, ${name}!`;
}
```

### Prompts

Prompts are template definitions for AI interactions:

```typescript
import { z } from "zod";
import { type InferSchema, type PromptMetadata } from "xmcp";

export const schema = {
  code: z.string().describe("The code to review"),
};

export const metadata: PromptMetadata = {
  name: "review-code",
  title: "Review Code",
  description: "Review code for best practices and potential issues",
  role: "user",
};

export default function reviewCode({ code }: InferSchema<typeof schema>) {
  return `Please review this code: ${code}`;
}
```

### Resources

Resources provide data or content with URI-based access:

```typescript
import { z } from "zod";
import { type ResourceMetadata, type InferSchema } from "xmcp";

export const schema = {
  userId: z.string().describe("The ID of the user"),
};

export const metadata: ResourceMetadata = {
  name: "user-profile",
  title: "User Profile",
  description: "User profile information",
};

export default function handler({ userId }: InferSchema<typeof schema>) {
  return `Profile data for user ${userId}`;
}
```

## Adding New Components

### Adding New Tools

To add a new tool:

1. Create a new `.ts` file in the `src/tools` directory
2. Export a `schema` object defining the tool parameters using Zod
3. Export a `metadata` object with tool information
4. Export a default function that implements the tool logic

### Adding New Prompts

To add a new prompt:

1. Create a new `.ts` file in the `src/prompts` directory
2. Export a `schema` object defining the prompt parameters using Zod
3. Export a `metadata` object with prompt information and role
4. Export a default function that returns the prompt text

### Adding New Resources

To add a new resource:

1. Create a new `.ts` file in the `src/resources` directory
2. Use folder structure to define the URI (e.g., `(users)/[userId]/profile.ts` → `users://{userId}/profile`)
3. Export a `schema` object for dynamic parameters (optional for static resources)
4. Export a `metadata` object with resource information
5. Export a default function that returns the resource content

## Building for Production

To build your project for production:

```bash
npm run build
# or
yarn build
# or
pnpm build
```

This will compile your TypeScript code and output it to the `dist` directory.

## Running the Server

You can run the server for the transport built with:

- HTTP: `node dist/http.js`
- STDIO: `node dist/stdio.js`

Given the selected transport method, you will have a custom start script added to the `package.json` file.

For HTTP:

```bash
npm run start-http
# or
yarn start-http
# or
pnpm start-http
```

For STDIO:

```bash
npm run start-stdio
# or
yarn start-stdio
# or
pnpm start-stdio
```

## Learn More

- [xmcp Documentation](https://xmcp.dev/docs)
