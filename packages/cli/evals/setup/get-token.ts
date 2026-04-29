import {
  CredentialsStore,
  getGlobalPathConfig,
} from '@vercel/cli-auth/credentials-store.js';
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

export function getToken(): string {
  if (process.env.VERCEL_TOKEN) {
    return process.env.VERCEL_TOKEN;
  }

  const dirs = [
    getGlobalPathConfig('com.vercel.cli'),
    join(homedir(), '.vercel'),
  ];

  for (const dir of dirs) {
    try {
      const token = CredentialsStore(dir, { authTokenStorage: 'file' }).get()
        .token;
      if (token) {
        return token;
      }
    } catch {
      // Best-effort fallback below
    }
  }

  try {
    const bashrc = readFileSync(join(homedir(), '.bashrc'), 'utf-8');
    const match = bashrc.match(/export VERCEL_TOKEN="([^"]+)"/);
    if (match) {
      return match[1];
    }
  } catch {
    // .bashrc not found or unreadable
  }

  throw new Error('No Vercel auth token found');
}
