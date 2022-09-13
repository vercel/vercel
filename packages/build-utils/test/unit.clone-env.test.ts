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
    Path: 'baz',
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

it('should default to process.env when no args', () => {
  expect(cloneEnv().PATH).toEqual(process.env.PATH);
});

it('should clone and merge multiple env objects', () => {
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
    Path: 'baz',
    PATH: 'baz',
  });
});
