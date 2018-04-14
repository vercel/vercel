export default async function* combineAsyncIterators(...args) {
  const nextPromises = args.map(i => i.next())
  while (true) {
    yield new Promise(resolve => {
      let resolved = false
      nextPromises.forEach((nextPromise, idx) => {
        nextPromise.then(({ value, done }) => {
          if (!resolved) {
            resolved = true
            resolve(value)
            if (!done) {
              nextPromises[idx] = args[idx].next()
            } else {
              delete nextPromises[idx]
            }
          }
        })
      })
    })
  }
}
