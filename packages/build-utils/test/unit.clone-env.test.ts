import { cloneEnv } from '../src';

it('should clone env with Path', () => {
  expect(
    cloneEnv(
      new Proxy(
        {
          foo: 'bar',
          Path: 'baz',
        },
        {
          get(target: typeof process.env, prop: string) {
            if (prop === 'PATH') {
              return target.PATH ?? target.Path;
            }
            return target[prop];
          },
        }
      )
    )
  ).toEqual({
    foo: 'bar',
    PATH: 'baz',
  });
});

it('should clone env with PATH', () => {
  expect(
    cloneEnv({
      foo: 'bar',
      PATH: 'baz',
    })
  ).toEqual({
    foo: 'bar',
    PATH: 'baz',
  });
});

it('should not overwrite PATH when path is undefined', () => {
  expect(
    cloneEnv(
      {
        PATH: 'baz',
      },
      new Proxy(
        {
          Path: undefined,
        },
        {
          get(target: typeof process.env, prop: string) {
            if (prop === 'PATH') {
              return target.PATH ?? target.Path;
            }
            return target[prop];
          },
        }
      )
    )
  ).toEqual({
    PATH: 'baz',
  });
});

it('should clone and merge multiple env objects', () => {
  // note: this also tests the last object doesn't overwrite `PATH` with
  // `undefined`
  expect(
    cloneEnv(
      {
        foo: 'bar',
      },
      {
        PATH: 'baz',
      },
      {
        baz: 'wiz',
      }
    )
  ).toEqual({
    foo: 'bar',
    PATH: 'baz',
    baz: 'wiz',
  });
});

it('should clone the actual process.env object', () => {
  expect(cloneEnv(process.env).PATH).toEqual(process.env.PATH);
});

it('should overwrite PATH with last value', () => {
  expect(
    cloneEnv(
      new Proxy(
        {
          Path: 'foo',
        },
        {
          get(target: typeof process.env, prop: string) {
            if (prop === 'PATH') {
              return target.PATH ?? target.Path;
            }
            return target[prop];
          },
        }
      ),
      {
        PATH: 'bar',
      },
      {
        PATH: undefined,
      }
    )
  ).toEqual({
    PATH: undefined,
  });
});

it('should handle process.env at any argument position', () => {
  expect(
    cloneEnv(
      {
        foo: 'bar',
      },
      new Proxy(
        {
          Path: 'baz',
        },
        {
          get(target: typeof process.env, prop: string) {
            if (prop === 'PATH') {
              return target.PATH ?? target.Path;
            }
            return target[prop];
          },
        }
      )
    )
  ).toEqual({
    foo: 'bar',
    PATH: 'baz',
  });
});
