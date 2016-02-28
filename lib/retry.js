import retrier from 'retry';

export default function retry (fn, opts) {
  return new Promise((resolve, reject) => {
    const op = retrier.operation(opts);
    const { onRetry } = opts;

    // we allow the user to abort retrying
    // this makes sense in the cases where
    // knowledge is obtained that retrying
    // would be futile (e.g.: auth errors)
    const bail = (err) => reject(err);

    op.attempt((num) => {
      if (num > 1 && onRetry) {
        const errs = op.errors();
        onRetry(errs[errs.length - 1]);
      }

      fn(bail)
      .then((val) => resolve(val))
      .catch(err => {
        if (!op.retry(err)) {
          reject(op.mainError());
        }
      });
    });
  });
}
