import { beforeAll, describe, expect, it } from 'vitest';
import stripAnsi from 'strip-ansi';
import output from '../../../../src/output-manager';
import {
  buildMethodGuidance,
  ConnexMethodError,
  CONNEX_REDIRECT_URI,
  createPathBadge,
  formatMethodOptions,
  formatTargetOptions,
  isSecretInputKey,
  needsCredentialPrompt,
  parseConnexParams,
  renderConnexMarkdown,
  soleTargetOf,
  wrapPlain,
  type ConnexConnectionMethod,
} from '../../../../src/util/connex/connection-methods';

function method(
  overrides: Partial<ConnexConnectionMethod> = {}
): ConnexConnectionMethod {
  return {
    connectionMethod: 'oauth',
    type: { type: 'oauth' },
    label: 'OAuth 2.0',
    create: { manual: true },
    ...overrides,
  };
}

describe('connex connection-method helpers', () => {
  // `renderConnexMarkdown` emits OSC-8 hyperlinks where the terminal supports
  // them, which is detected from the stream. Pin it so these assertions test
  // the fallback rendering regardless of run order or CI terminal.
  beforeAll(() => {
    output.initialize({ supportsHyperlink: false });
  });

  describe('parseConnexParams', () => {
    it('returns an empty map for no flags', () => {
      expect(parseConnexParams(undefined)).toEqual({
        params: {},
        warnings: [],
      });
    });

    it('splits on the first = only so values can contain =', () => {
      const { params } = parseConnexParams(['token=a=b=c']);
      expect(params).toEqual({ token: 'a=b=c' });
    });

    it('keeps an empty value', () => {
      const { params } = parseConnexParams(['domain=']);
      expect(params).toEqual({ domain: '' });
    });

    it('takes the last duplicate and warns', () => {
      const { params, warnings } = parseConnexParams(['a=1', 'a=2']);
      expect(params).toEqual({ a: '2' });
      expect(warnings).toEqual([
        '--param a was passed more than once. Using the last value.',
      ]);
    });

    it('rejects a value with no =', () => {
      expect(() => parseConnexParams(['domain'])).toThrow(ConnexMethodError);
    });

    it('rejects an empty key', () => {
      expect(() => parseConnexParams(['=value'])).toThrow(ConnexMethodError);
    });
  });

  describe('formatting', () => {
    it('enumerates methods as slug plus label', () => {
      expect(
        formatMethodOptions([
          method(),
          method({ connectionMethod: 'mcp', label: 'MCP' }),
        ])
      ).toBe('oauth (OAuth 2.0), mcp (MCP)');
    });

    it('enumerates targets as slug plus label', () => {
      expect(
        formatTargetOptions([
          { target: 'api', label: 'Notion API' },
          { target: 'mcp', label: 'Notion MCP' },
        ])
      ).toBe('api (Notion API), mcp (Notion MCP)');
    });
  });

  describe('createPathBadge', () => {
    it('prefers managed when a method offers both paths', () => {
      expect(
        createPathBadge(method({ create: { managed: true, manual: true } }))
      ).toBe('automatic registration');
    });

    it('reports BYO credentials when managed is false', () => {
      expect(
        createPathBadge(method({ create: { managed: false, manual: true } }))
      ).toBe('bring your own credentials');
    });

    it('reports BYO credentials when managed is unknown', () => {
      expect(createPathBadge(method({ create: { manual: true } }))).toBe(
        'bring your own credentials'
      );
    });

    it('has nothing to say when neither path is available', () => {
      expect(
        createPathBadge(method({ create: { managed: false, manual: false } }))
      ).toBeUndefined();
    });
  });

  describe('soleTargetOf', () => {
    it('returns the only target a method serves', () => {
      expect(soleTargetOf(method({ targets: ['api'] }))).toBe('api');
    });

    it('returns nothing when the method is ambiguous or target-less', () => {
      expect(soleTargetOf(method({ targets: ['api', 'mcp'] }))).toBeUndefined();
      expect(soleTargetOf(method())).toBeUndefined();
    });
  });

  describe('renderConnexMarkdown', () => {
    it('collapses links to text plus url', () => {
      expect(
        renderConnexMarkdown('See [the docs](https://example.com/x).')
      ).toBe('See the docs (https://example.com/x).');
    });

    it('prints a self-linking url once instead of twice', () => {
      expect(
        stripAnsi(
          renderConnexMarkdown(
            'Mint one at [example.com/tokens](https://example.com/tokens).'
          )
        )
      ).toBe('Mint one at https://example.com/tokens.');
    });

    it('bolds without leaving asterisks behind', () => {
      expect(stripAnsi(renderConnexMarkdown('Create a **public** app'))).toBe(
        'Create a public app'
      );
    });

    it('passes everything else through verbatim', () => {
      expect(renderConnexMarkdown('Use `--data` for extras.')).toBe(
        'Use `--data` for extras.'
      );
    });
  });

  describe('wrapPlain', () => {
    it('breaks on whitespace without splitting words', () => {
      expect(wrapPlain('one two three four five', 9)).toEqual([
        'one two',
        'three',
        'four five',
      ]);
    });

    it('keeps a word longer than the width on its own line', () => {
      expect(wrapPlain('a supercalifragilistic b', 6)).toEqual([
        'a',
        'supercalifragilistic',
        'b',
      ]);
    });

    it('returns nothing for empty text', () => {
      expect(wrapPlain('   ', 10)).toEqual([]);
    });
  });

  describe('buildMethodGuidance', () => {
    it('generates the OAuth baseline and appends the registry note', () => {
      const lines = buildMethodGuidance(
        method({
          settingsUrl: 'https://example.com/apps',
          docUrl: 'https://example.com/docs',
          instructions: 'Create a **public** integration.',
        }),
        'Example'
      ).map(stripAnsi);

      expect(lines).toEqual([
        'Register an OAuth app for Example at https://example.com/apps and copy its Client ID and Client Secret.',
        `Add ${CONNEX_REDIRECT_URI} as a redirect URI in that app.`,
        'Docs: https://example.com/docs',
        'Create a public integration.',
      ]);
    });

    it('falls back to the doc URL as the register link and skips a duplicate docs row', () => {
      const lines = buildMethodGuidance(
        method({ docUrl: 'https://example.com/docs' }),
        'Example'
      ).map(stripAnsi);

      expect(lines).toEqual([
        'Register an OAuth app for Example at https://example.com/docs and copy its Client ID and Client Secret.',
        `Add ${CONNEX_REDIRECT_URI} as a redirect URI in that app.`,
      ]);
    });

    it('renders api-key instructions whole, with no OAuth baseline', () => {
      const lines = buildMethodGuidance(
        method({
          type: { type: 'api-key' },
          label: 'API key',
          settingsUrl: 'https://example.com/tokens',
          instructions: 'Mint a token at [tokens](https://example.com/tokens).',
        }),
        'Example'
      ).map(stripAnsi);

      expect(lines).toEqual([
        'Mint a token at tokens (https://example.com/tokens).',
      ]);
    });
  });

  describe('isSecretInputKey', () => {
    it('follows the vended encryptedFields', () => {
      const withFields = method({
        type: { type: 'oauth', encryptedFields: ['clientSecret'] },
      });
      expect(isSecretInputKey(withFields, 'clientSecret')).toBe(true);
      // `apiKey` matches the name heuristic but is not vended as encrypted.
      expect(isSecretInputKey(withFields, 'apiKey')).toBe(false);
    });

    it('falls back to the name heuristic when none are vended', () => {
      expect(isSecretInputKey(method(), 'clientSecret')).toBe(true);
      expect(isSecretInputKey(method(), 'apiKey')).toBe(true);
      expect(isSecretInputKey(method(), 'clientId')).toBe(false);
    });
  });

  describe('needsCredentialPrompt', () => {
    it('skips keys the registry already resolves', () => {
      const withDefaults = method({
        type: {
          type: 'oauth',
          createInputDefaults: {
            tokenEndpointAuthMethod: 'client_secret_basic',
          },
        },
      });
      expect(
        needsCredentialPrompt(
          withDefaults,
          'tokenEndpointAuthMethod',
          undefined
        )
      ).toBe(false);
      expect(needsCredentialPrompt(withDefaults, 'clientId', undefined)).toBe(
        true
      );
    });

    it('skips keys already supplied through --data', () => {
      expect(
        needsCredentialPrompt(method(), 'clientId', { clientId: 'abc' })
      ).toBe(false);
    });

    it('never prompts for endpoint-identity keys', () => {
      for (const key of ['serverConfig', 'serverUrl', 'discoveryServerUrl']) {
        expect(needsCredentialPrompt(method(), key, undefined)).toBe(false);
      }
    });
  });
});
