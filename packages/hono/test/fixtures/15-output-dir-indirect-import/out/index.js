import { createApp } from "../setup.js";

// This file doesn't directly import hono, so it will fail the regex check
// But it should still work as a fallback when there's an output directory
const app = createApp();

export default app;
