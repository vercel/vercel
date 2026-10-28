import type { RunError } from '../../util';
import { StoreOperations } from './operations';
import type { RestoreResult, SaveResult, StoreCommandRequest } from './types';

async function main(): Promise<void> {
  const request = JSON.parse(process.argv[2]) as StoreCommandRequest;
  const operations = new StoreOperations();
  let result: RestoreResult | SaveResult | null;
  switch (request.action) {
    case 'restore':
      result = await operations.restore(request.options);
      break;
    case 'extract':
      result = await operations.extract(request.options);
      break;
    case 'save':
      result = await operations.save(request.options);
      break;
    case 'cleanup':
      await operations.cleanup(request.options);
      result = null;
      break;
    default:
      throw new Error('unknown Buildah store command');
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`
  );
  const exitCode = (error as RunError)?.exitCode;
  process.exitCode =
    typeof exitCode === 'number' &&
    Number.isInteger(exitCode) &&
    exitCode >= 1 &&
    exitCode <= 255
      ? exitCode
      : 1;
});
