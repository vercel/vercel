import { Hono } from 'hono';
import { createRequestHandler } from 'react-router';

// @ts-expect-error - virtual module provided by React Router at build time
import * as build from "virtual:react-router/server-build";

declare module "react-router" {
    interface AppLoadContext {
        VALUE_FROM_HONO: string;
    }
}

const app = new Hono();
const handler = createRequestHandler(build);

app.use((c) => handler(c.req.raw, {
    VALUE_FROM_HONO: 'Hello from Hono'
}));

export default app.fetch;
