import { UserConsoleLog } from 'vitest';
import { BaseReporter, DefaultReporter } from 'vitest/reporters';

function getWriter(context: BaseReporter['ctx'], log: UserConsoleLog) {
  const output =
    log.type === 'stdout'
      ? context.logger.outputStream
      : context.logger.errorStream;
  const write = (msg: string) => (output as any).write(msg);
  return write;
}

export default class VitestReporter extends DefaultReporter {
  onUserConsoleLog(log: UserConsoleLog) {
    // based on base implementation
    // https://github.com/vitest-dev/vitest/blob/f1ef2f6362d1607953d383e395d503feb5368613/packages/vitest/src/node/reporters/base.ts#L295
    // stripped down to just the log message
    const write = getWriter(this.ctx, log);
    write(log.content);
  }
}
