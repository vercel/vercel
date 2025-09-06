import { errorHandler } from './error-handler';

// At the top of the file
const mockSetExtra = jest.fn();
const mockSetTag = jest.fn();

jest.mock('@sentry/node', () => ({
  init: jest.fn(),
  captureException: jest.fn(),
  withScope: jest.fn((callback) => {
    callback({
      setExtra: mockSetExtra,
      setTag: mockSetTag,
    });
  }),
}));

jest.mock('./assert-env', () => ({
  assertEnv: jest.fn().mockReturnValue('test-value'),
}));

describe('errorHandler - Prototype Pollution Protection', () => {
  beforeEach(() => {
    // Set SENTRY_DSN to enable Sentry processing
    process.env.SENTRY_DSN = 'https://test@sentry.io/123';
    jest.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.SENTRY_DSN;
  });

  test('should process safe keys normally', () => {
    const error = new Error('Test error');
    const safeExtras = {
      userId: '123',
      requestId: 'abc-def',
      customData: 'test',
    };

    errorHandler(error, safeExtras);

    expect(mockSetExtra).toHaveBeenCalledWith('userId', '123');
    expect(mockSetExtra).toHaveBeenCalledWith('requestId', 'abc-def');
    expect(mockSetExtra).toHaveBeenCalledWith('customData', 'test');
    expect(mockSetExtra).toHaveBeenCalledTimes(3);
  });

  test('should filter out __proto__ to prevent prototype pollution', () => {
    const error = new Error('Test error');
    const maliciousExtras = {
      userId: '123',
      __proto__: { polluted: true },
      safeKey: 'safe value',
    };

    errorHandler(error, maliciousExtras);

    // Verify __proto__ is filtered out
    expect(mockSetExtra).toHaveBeenCalledWith('userId', '123');
    expect(mockSetExtra).toHaveBeenCalledWith('safeKey', 'safe value');
    expect(mockSetExtra).not.toHaveBeenCalledWith('__proto__', expect.anything());
    expect(mockSetExtra).toHaveBeenCalledTimes(2);
  });

  test('should filter out constructor to prevent prototype pollution', () => {
    const error = new Error('Test error');
    const maliciousExtras = {
      userId: '123',
      constructor: { prototype: { polluted: true } },
      safeKey: 'safe value',
    };

    errorHandler(error, maliciousExtras);

    // Verify constructor is filtered out
    expect(mockSetExtra).toHaveBeenCalledWith('userId', '123');
    expect(mockSetExtra).toHaveBeenCalledWith('safeKey', 'safe value');
    expect(mockSetExtra).not.toHaveBeenCalledWith('constructor', expect.anything());
    expect(mockSetExtra).toHaveBeenCalledTimes(2);
  });

  test('should filter out prototype to prevent prototype pollution', () => {
    const error = new Error('Test error');
    const maliciousExtras = {
      userId: '123',
      prototype: { polluted: true },
      safeKey: 'safe value',
    };

    errorHandler(error, maliciousExtras);

    // Verify prototype is filtered out
    expect(mockSetExtra).toHaveBeenCalledWith('userId', '123');
    expect(mockSetExtra).toHaveBeenCalledWith('safeKey', 'safe value');
    expect(mockSetExtra).not.toHaveBeenCalledWith('prototype', expect.anything());
    expect(mockSetExtra).toHaveBeenCalledTimes(2);
  });

  test('should handle undefined extras gracefully', () => {
    const error = new Error('Test error');

    errorHandler(error, undefined);

    // Verify no setExtra calls when extras is undefined
    expect(mockSetExtra).toHaveBeenCalledTimes(0);
  });

  test('should not pollute Object.prototype', () => {
    const error = new Error('Test error');
    const maliciousExtras = {
      __proto__: { polluted: true },
      constructor: { prototype: { polluted: true } },
      prototype: { polluted: true },
    };

    // Store original prototype state
    const originalPrototype = Object.prototype;
    const originalConstructor = originalPrototype.constructor;

    errorHandler(error, maliciousExtras);

    // Verify Object.prototype is not polluted
    expect(Object.prototype).toBe(originalPrototype);
    expect(Object.prototype.constructor).toBe(originalConstructor);
    expect((Object.prototype as any).polluted).toBeUndefined();
  });
});