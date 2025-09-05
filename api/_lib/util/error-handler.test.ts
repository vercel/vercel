import { errorHandler } from '../error-handler';

// Mock Sentry to avoid actual error reporting during tests
jest.mock('@sentry/node', () => ({
  init: jest.fn(),
  captureException: jest.fn(),
  withScope: jest.fn((fn) => {
    const mockScope = {
      setTag: jest.fn(),
      setExtra: jest.fn(),
    };
    fn(mockScope);
    return mockScope;
  }),
}));

jest.mock('../assert-env', () => ({
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
    const { withScope } = require('@sentry/node');
    const error = new Error('Test error');
    const safeExtras = {
      userId: '123',
      requestId: 'abc-def',
      customData: 'test',
    };

    errorHandler(error, safeExtras);

    expect(withScope).toHaveBeenCalled();
    const scopeCallback = withScope.mock.calls[0][0];
    const mockScope = {
      setTag: jest.fn(),
      setExtra: jest.fn(),
    };
    scopeCallback(mockScope);

    // Verify safe keys are processed
    expect(mockScope.setExtra).toHaveBeenCalledWith('userId', '123');
    expect(mockScope.setExtra).toHaveBeenCalledWith('requestId', 'abc-def');
    expect(mockScope.setExtra).toHaveBeenCalledWith('customData', 'test');
    expect(mockScope.setExtra).toHaveBeenCalledTimes(3);
  });

  test('should filter out __proto__ to prevent prototype pollution', () => {
    const { withScope } = require('@sentry/node');
    const error = new Error('Test error');
    const maliciousExtras = {
      userId: '123',
      __proto__: { polluted: true },
      safeKey: 'safe value',
    };

    errorHandler(error, maliciousExtras);

    expect(withScope).toHaveBeenCalled();
    const scopeCallback = withScope.mock.calls[0][0];
    const mockScope = {
      setTag: jest.fn(),
      setExtra: jest.fn(),
    };
    scopeCallback(mockScope);

    // Verify __proto__ is filtered out
    expect(mockScope.setExtra).toHaveBeenCalledWith('userId', '123');
    expect(mockScope.setExtra).toHaveBeenCalledWith('safeKey', 'safe value');
    expect(mockScope.setExtra).not.toHaveBeenCalledWith('__proto__', expect.anything());
    expect(mockScope.setExtra).toHaveBeenCalledTimes(2);
  });

  test('should filter out constructor to prevent prototype pollution', () => {
    const { withScope } = require('@sentry/node');
    const error = new Error('Test error');
    const maliciousExtras = {
      userId: '123',
      constructor: { prototype: { polluted: true } },
      safeKey: 'safe value',
    };

    errorHandler(error, maliciousExtras);

    expect(withScope).toHaveBeenCalled();
    const scopeCallback = withScope.mock.calls[0][0];
    const mockScope = {
      setTag: jest.fn(),
      setExtra: jest.fn(),
    };
    scopeCallback(mockScope);

    // Verify constructor is filtered out
    expect(mockScope.setExtra).toHaveBeenCalledWith('userId', '123');
    expect(mockScope.setExtra).toHaveBeenCalledWith('safeKey', 'safe value');
    expect(mockScope.setExtra).not.toHaveBeenCalledWith('constructor', expect.anything());
    expect(mockScope.setExtra).toHaveBeenCalledTimes(2);
  });

  test('should filter out prototype to prevent prototype pollution', () => {
    const { withScope } = require('@sentry/node');
    const error = new Error('Test error');
    const maliciousExtras = {
      userId: '123',
      prototype: { polluted: true },
      safeKey: 'safe value',
    };

    errorHandler(error, maliciousExtras);

    expect(withScope).toHaveBeenCalled();
    const scopeCallback = withScope.mock.calls[0][0];
    const mockScope = {
      setTag: jest.fn(),
      setExtra: jest.fn(),
    };
    scopeCallback(mockScope);

    // Verify prototype is filtered out
    expect(mockScope.setExtra).toHaveBeenCalledWith('userId', '123');
    expect(mockScope.setExtra).toHaveBeenCalledWith('safeKey', 'safe value');
    expect(mockScope.setExtra).not.toHaveBeenCalledWith('prototype', expect.anything());
    expect(mockScope.setExtra).toHaveBeenCalledTimes(2);
  });

  test('should handle undefined extras gracefully', () => {
    const { withScope } = require('@sentry/node');
    const error = new Error('Test error');

    errorHandler(error, undefined);

    expect(withScope).toHaveBeenCalled();
    const scopeCallback = withScope.mock.calls[0][0];
    const mockScope = {
      setTag: jest.fn(),
      setExtra: jest.fn(),
    };
    scopeCallback(mockScope);

    // Verify no setExtra calls when extras is undefined
    expect(mockScope.setExtra).toHaveBeenCalledTimes(0);
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