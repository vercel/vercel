import { execAsync, NowBuildError } from '../src';

it('should execute a command', async () => {
  const { code, stdout, stderr } = await execAsync('echo', ['hello']);

  expect(code).toBe(0);
  expect(stdout).toBe('hello\n');
  expect(stderr).toBe('');
});

it('should throw if the command exits with non-0 code', async () => {
  await expect(execAsync('cat', ['unknown-file'])).rejects.toBeInstanceOf(
    NowBuildError
  );
});

it('should return if the command exits with non-0 code and ignoreNon0Exit=true', async () => {
  const { code, stdout, stderr } = await execAsync('cat', ['unknown-file'], {
    ignoreNon0Exit: true,
  });

  expect(code).toBe(1);
  expect(stdout).toBe('');
  expect(stderr).toContain('No such file or directory');
});
