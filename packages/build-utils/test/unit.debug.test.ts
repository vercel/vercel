import { debug } from '../src';

describe('Test `debug()`', () => {
  let logMessages: string[];
  const originalConsoleLog = console.log;

  beforeEach(() => {
    logMessages = [];
    console.log = m => {
      logMessages.push(m);
    };
  });

  afterEach(() => {
    console.log = originalConsoleLog;
  });

  it('should not log when env var is not assigned', async () => {
    debug('Hello world');
    expect(logMessages.length).toBe(0);
  });

  it('should log when env var is assigned', async () => {
    const original = process.env.VERCEL_DEBUG_PREFIX;
    try {
      process.env.VERCEL_DEBUG_PREFIX = 'HELLO: ';
      debug('world');
    } finally {
      process.env.VERCEL_DEBUG_PREFIX = original;
    }
    expect(logMessages[0]).toBe('HELLO: world');
  });

  it('should replace newline with space', async () => {
    const original = process.env.VERCEL_DEBUG_PREFIX;
    try {
      process.env.VERCEL_DEBUG_PREFIX = 'DEBUG: ';
      debug('Hello\nwith\nnew\nlines');
    } finally {
      process.env.VERCEL_DEBUG_PREFIX = original;
    }
    expect(logMessages[0]).toBe('DEBUG: Hello with new lines');
  });

  it('should replace carriage return and newline with space', async () => {
    const original = process.env.VERCEL_DEBUG_PREFIX;
    try {
      process.env.VERCEL_DEBUG_PREFIX = 'DEBUG: ';
      debug('Hello\r\nwith\r\ncarriage\r\nreturns');
    } finally {
      process.env.VERCEL_DEBUG_PREFIX = original;
    }
    expect(logMessages[0]).toBe('DEBUG: Hello with carriage returns');
  });
});
