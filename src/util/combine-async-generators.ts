// Combines two async generators into one that stops when all the generators
// passed are done.
export default async function* combineAsyncIterators(...args: any[]) {
  let nextPromises = args.map(i => i.next());
  while (nextPromises.length > 0) {
    yield new Promise(resolve => {
      let resolved = false;
      nextPromises.forEach((nextPromise, idx) => {
        nextPromise.then(({ value, done }: { value: any, done: boolean }) => {
          if (!resolved) {
            resolved = true;
            resolve(value);
            if (!done) {
              nextPromises[idx] = args[idx].next();
            } else {
              nextPromises = [
                ...nextPromises.slice(0, idx),
                ...nextPromises.slice(idx + 1)
              ];
            }
          }
        });
      });
    });
  }
}
