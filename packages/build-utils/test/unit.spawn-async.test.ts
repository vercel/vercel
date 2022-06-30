import { spawnAsync, NowBuildError } from '../src';

it('should execute a command', async () => {
  // should resolve (it doesn't return anything, so it resolves with "undefined")
  await expect(spawnAsync('echo', ['hello'])).resolves.toBeUndefined();
});

it('should throw if the command exits with non-0 code', async () => {
  await expect(spawnAsync('find', ['unknown-file'])).rejects.toBeInstanceOf(
    NowBuildError
  );
});

it('should return if the command exits with non-0 code and ignoreNon0Exit=true', async () => {
  // should resolve (it doesn't return anything, so it resolves with "undefined")
  await expect(
    spawnAsync('find', ['unknown-file'], {
      ignoreNon0Exit: true,
    })
  ).resolves.toBeUndefined();
});
