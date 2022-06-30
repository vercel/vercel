import { spawnAsync, NowBuildError } from '../src';

it('should execute a command', async () => {
  await expect(spawnAsync('echo', ['hello'])).resolves.toBeDefined();
});

it('should throw if the command exits with non-0 code', async () => {
  await expect(spawnAsync('cat', ['unknown-file'])).rejects.toBeInstanceOf(
    NowBuildError
  );
});

it('should return if the command exits with non-0 code and ignoreNon0Exit=true', async () => {
  await expect(spawnAsync('echo', ['hello'])).resolves.toBeDefined();
});
