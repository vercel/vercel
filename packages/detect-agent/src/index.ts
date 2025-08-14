import { access } from 'node:fs/promises';
import { constants } from 'node:fs';

const devinLocalPath = '/opt/.devin';

const CURSOR = 'cursor';
const CURSOR_CLI = 'cursor-cli';
const CLAUDE = 'claude';
const DEVIN = 'devin';
const REPLIT = 'replit';

export async function determineAgent(): Promise<string | false> {
  if (process.env.AI_AGENT) {
    return process.env.AI_AGENT;
  }

  if (process.env.CURSOR_TRACE_ID) {
    return CURSOR;
  }

  if (process.env.CURSOR_AGENT) {
    return CURSOR_CLI;
  }

  if (process.env.CLAUDECODE || process.env.CLAUDE_CODE) {
    return CLAUDE;
  }

  if (process.env.REPL_ID) {
    return REPLIT;
  }

  try {
    await access(devinLocalPath, constants.F_OK);
    return DEVIN;
  } catch (error) {
    return false;
  }
}
