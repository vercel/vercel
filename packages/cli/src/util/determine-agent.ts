import { access } from 'node:fs/promises';
import { constants } from 'node:fs';

const devinLocalPath = '/opt/.devin';

const CURSOR = 'cursor';
const CLAUDE = 'claude';
const DEVIN = 'devin';

export async function determineAgent(): Promise<string | false> {
  if (process.env.CURSOR_TRACE_ID) {
    return CURSOR;
  }

  if (process.env.CLAUDE_CODE) {
    return CLAUDE;
  }

  try {
    await access(devinLocalPath, constants.F_OK);
    return DEVIN;
  } catch (error) {
    return false;
  }
}
