import {
  validateProxyConfig,
  validateProxy,
  getProxyBuilder,
  detectBuilders,
  REGEX_NON_VERCEL_PLATFORM_FILES,
} from '../src/detect-builders';

beforeEach(() => {
  process.env.VERCEL_PYTHON_PROXY = '1';
});

afterEach(() => {
  delete process.env.VERCEL_PYTHON_PROXY;
});

// ---------------------------------------------------------------------------
// validateProxyConfig
// ---------------------------------------------------------------------------

describe('validateProxyConfig', () => {
  // --- valid entrypoints ---

  it('accepts a .ts entrypoint', () => {
    expect(validateProxyConfig({ entrypoint: 'proxy.ts' })).toBeNull();
  });

  it('accepts a .js entrypoint', () => {
    expect(validateProxyConfig({ entrypoint: 'proxy.js' })).toBeNull();
  });

  it('accepts a nested .ts entrypoint', () => {
    expect(validateProxyConfig({ entrypoint: 'routing/proxy.ts' })).toBeNull();
  });

  it('accepts a Python module:attr entrypoint', () => {
    expect(validateProxyConfig({ entrypoint: 'proxy:app' })).toBeNull();
  });

  // --- matchers ---

  it('accepts a string matcher with a JS entrypoint', () => {
    expect(
      validateProxyConfig({ entrypoint: 'proxy.ts', matcher: '/api/*' })
    ).toBeNull();
  });

  it('accepts an array matcher with a JS entrypoint', () => {
    expect(
      validateProxyConfig({
        entrypoint: 'proxy.ts',
        matcher: ['/api/*', '/admin/*'],
      })
    ).toBeNull();
  });

  it('accepts a matcher with a Python entrypoint', () => {
    expect(
      validateProxyConfig({ entrypoint: 'proxy:app', matcher: '/api/*' })
    ).toBeNull();
  });

  it('rejects a matcher missing the leading slash', () => {
    const result = validateProxyConfig({
      entrypoint: 'proxy.ts',
      matcher: 'api/*',
    });
    expect(result?.code).toBe('invalid_proxy_matcher');
  });

  it('rejects an empty matcher array', () => {
    const result = validateProxyConfig({
      entrypoint: 'proxy.ts',
      matcher: [],
    });
    expect(result?.code).toBe('invalid_proxy_matcher');
  });

  // --- invalid entrypoints ---

  it('rejects when entrypoint is missing', () => {
    // @ts-expect-error — intentional bad input
    expect(validateProxyConfig({ entrypoint: '' })?.code).toBe('invalid_proxy');
  });

  it('rejects a .mjs entrypoint', () => {
    expect(validateProxyConfig({ entrypoint: 'proxy.mjs' })?.code).toBe(
      'invalid_proxy_entrypoint'
    );
  });

  it('rejects a .d.ts file', () => {
    expect(validateProxyConfig({ entrypoint: 'proxy.d.ts' })?.code).toBe(
      'invalid_proxy_entrypoint'
    );
  });

  it('rejects a bare .py path', () => {
    const result = validateProxyConfig({ entrypoint: 'proxy.py' });
    expect(result?.code).toBe('invalid_proxy_entrypoint');
    expect(result?.message).toMatch(/module:attr/);
  });

  it('rejects module: with empty attribute', () => {
    expect(validateProxyConfig({ entrypoint: 'proxy:' })?.code).toBe(
      'invalid_proxy_entrypoint'
    );
  });
});

// ---------------------------------------------------------------------------
// validateProxy
// ---------------------------------------------------------------------------

describe('validateProxy', () => {
  it('accepts a .ts entrypoint when the file exists', () => {
    expect(
      validateProxy({ proxy: { entrypoint: 'proxy.ts' } }, ['proxy.ts'], null)
    ).toBeNull();
  });

  it('accepts a .js entrypoint when the file exists', () => {
    expect(
      validateProxy({ proxy: { entrypoint: 'proxy.js' } }, ['proxy.js'], null)
    ).toBeNull();
  });

  it('accepts a Python entrypoint when the resolved .py file exists', () => {
    expect(
      validateProxy(
        { proxy: { entrypoint: 'proxy:app' } },
        ['proxy.py', 'index.html'],
        null
      )
    ).toBeNull();
  });

  it('rejects when a .ts file is absent', () => {
    expect(
      validateProxy({ proxy: { entrypoint: 'proxy.ts' } }, [], null)?.code
    ).toBe('proxy_entrypoint_not_found');
  });

  it('rejects when the resolved .py file is absent', () => {
    const result = validateProxy(
      { proxy: { entrypoint: 'proxy:app' } },
      ['index.html'],
      null
    );
    expect(result?.code).toBe('proxy_entrypoint_not_found');
    expect(result?.message).toMatch(/proxy:app/);
  });

  it('rejects a JS proxy for Next.js', () => {
    expect(
      validateProxy(
        { proxy: { entrypoint: 'proxy.ts' } },
        ['proxy.ts'],
        'nextjs'
      )?.code
    ).toBe('proxy_framework_conflict');
  });

  it('rejects a JS proxy for Astro', () => {
    expect(
      validateProxy(
        { proxy: { entrypoint: 'proxy.ts' } },
        ['proxy.ts'],
        'astro'
      )?.code
    ).toBe('proxy_framework_conflict');
  });

  it('rejects a Python proxy for Express', () => {
    expect(
      validateProxy(
        { proxy: { entrypoint: 'proxy:app' } },
        ['proxy.py'],
        'express'
      )?.code
    ).toBe('proxy_runtime_mismatch');
  });

  it('rejects a Python proxy for SvelteKit', () => {
    expect(
      validateProxy(
        { proxy: { entrypoint: 'proxy:app' } },
        ['proxy.py'],
        'sveltekit-1'
      )?.code
    ).toBe('proxy_runtime_mismatch');
  });

  it.each([
    'nextjs',
    'astro',
  ])('reports runtime mismatch before framework conflict for a Python proxy with %s', framework => {
    expect(
      validateProxy(
        { proxy: { entrypoint: 'proxy:app' } },
        ['proxy.py'],
        framework
      )?.code
    ).toBe('proxy_runtime_mismatch');
  });

  it('returns null when proxy is not configured', () => {
    expect(validateProxy({}, ['proxy.py'], null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getProxyBuilder
// ---------------------------------------------------------------------------

describe('getProxyBuilder', () => {
  // --- JS/TS ---

  it('returns @vercel/node for a .ts entrypoint', () => {
    const builder = getProxyBuilder({ entrypoint: 'proxy.ts' });
    expect(builder.use).toBe('@vercel/node');
    expect(builder.src).toBe('proxy.ts');
    expect(builder.config?.middleware).toBe(true);
    expect(builder.config?.middlewareRuntime).toBe('nodejs');
    expect(builder.config?.handlerFunction).toBeUndefined();
  });

  it('returns @vercel/node for a .js entrypoint', () => {
    const builder = getProxyBuilder({ entrypoint: 'proxy.js' });
    expect(builder.use).toBe('@vercel/node');
    expect(builder.src).toBe('proxy.js');
  });

  it('includes a tag in the @vercel/node runtime', () => {
    const builder = getProxyBuilder({ entrypoint: 'proxy.ts' }, 'canary');
    expect(builder.use).toBe('@vercel/node@canary');
  });

  it('propagates a string matcher for a JS entrypoint', () => {
    const builder = getProxyBuilder({
      entrypoint: 'proxy.ts',
      matcher: '/api/*',
    });
    expect(builder.config?.middlewareMatcher).toBe('/api/*');
  });

  it('propagates an array matcher for a JS entrypoint', () => {
    const builder = getProxyBuilder({
      entrypoint: 'proxy.ts',
      matcher: ['/api/*', '/admin/*'],
    });
    expect(builder.config?.middlewareMatcher).toEqual(['/api/*', '/admin/*']);
  });

  it('uses a functions runtime override for a TS entrypoint', () => {
    const builder = getProxyBuilder({ entrypoint: 'proxy.ts' }, undefined, {
      'proxy.ts': { runtime: 'my-custom-runtime@1.0.0' },
    });
    expect(builder.use).toBe('my-custom-runtime@1.0.0');
  });

  // --- Python ---

  it('returns @vercel/python for a module:attr entrypoint', () => {
    const builder = getProxyBuilder({ entrypoint: 'proxy:app' });
    expect(builder.use).toBe('@vercel/python');
    expect(builder.src).toBe('proxy.py');
    expect(builder.config?.middleware).toBe(true);
    expect(builder.config?.handlerFunction).toBe('app');
    expect(builder.config?.middlewareRuntime).toBeUndefined();
  });

  it('includes a tag in the @vercel/python runtime', () => {
    const builder = getProxyBuilder({ entrypoint: 'proxy:app' }, 'canary');
    expect(builder.use).toBe('@vercel/python@canary');
  });

  it('propagates a matcher for a Python entrypoint', () => {
    const builder = getProxyBuilder({
      entrypoint: 'proxy:app',
      matcher: '/api/*',
    });
    expect(builder.config?.middlewareMatcher).toBe('/api/*');
  });

  it('uses a functions runtime override for a Python entrypoint', () => {
    const builder = getProxyBuilder({ entrypoint: 'proxy:app' }, undefined, {
      'proxy.py': { runtime: 'my-custom-runtime@1.0.0' },
    });
    expect(builder.use).toBe('my-custom-runtime@1.0.0');
  });
});

describe('detectBuilders', () => {
  it('claims the resolved Python proxy file alongside reserved schedule sources', async () => {
    const { builders, errors } = await detectBuilders(
      ['proxy.py', 'jobs/nightly.py', 'index.html'],
      null,
      {
        proxy: { entrypoint: 'proxy:app' },
        reservedFunctionFiles: ['jobs/nightly.py'],
      }
    );

    expect(errors).toBeNull();
    expect(builders).toEqual([
      expect.objectContaining({ src: 'proxy.py', use: '@vercel/python' }),
      expect.objectContaining({
        src: REGEX_NON_VERCEL_PLATFORM_FILES.replace(
          '}',
          ',proxy.py,jobs/nightly.py}'
        ),
        use: '@vercel/static',
      }),
    ]);
  });
});
