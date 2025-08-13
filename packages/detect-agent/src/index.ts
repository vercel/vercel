import { access } from 'node:fs/promises';
import { constants } from 'node:fs';

const devinLocalPath = '/opt/.devin';

const CURSOR = 'cursor';
const CLAUDE = 'claude';
const DEVIN = 'devin';
const REPLIT = 'replit';

export async function determineAgent(): Promise<string | false> {
  if (process.env.CURSOR_TRACE_ID) {
    return CURSOR;
  }

  if (process.env.CLAUDE_CODE) {
    return CLAUDE;
  }

  if (process.env.REPL_ID) {
    return REPLIT;
  }

  /*
  // TODO: add environment variable for Gemini
  // Gemini does not appear to add any environment variables to identify it.

  // TODO: add environment variable for Codex
  // codex does not appear to add any environment variables to identify it.

  // TODO: add environment variable for Cursor Background Agents
  // cursor does not appear to add any environment variables to identify it.

  // TODO: add environment variable for Zed
  // zed does not appear to add any environment variables to identify it.
  */

  try {
    await access(devinLocalPath, constants.F_OK);
    return DEVIN;
  } catch (error) {
    return false;
  }
}
