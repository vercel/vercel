// Combines two o more async generators into one that stops when the first
// generator finishes.
export default async function* raceAsyncGenerators(...args: any[]) {
  let nextPromises = args.map(i => i.next());
  while (nextPromises.length === args.length) {
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
