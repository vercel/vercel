// @flow

async function* combineImplementation(...args) {
  // $FlowFixMe
  const threads = args.map(i => i[Symbol.asyncIterator]())
  const sparks = new Set(threads.map(i => ({thread:i,step:i.next()})))
  try {
    while(sparks.size) {
      const promises = [...sparks].map(i => i.step.then(({done,value}) => ({done,value,spark:i})))
      const v = await Promise.race(promises)
      sparks.delete(v.spark)
      if (!v.done) {
        sparks.add({...v.spark,step:v.spark.thread.next()})
        yield v.value
      }
    }
  } finally {
    await Promise.all([...threads].map((i) => i.return()))
  }
}

type CombineAsyncGenerators = 
  <A, B>(AsyncGenerator<A, void, void>, AsyncGenerator<B, void, void>) => AsyncGenerator<A | B, void, void> |
  <A, B, C>(AsyncGenerator<A, void, void>, AsyncGenerator<B, void, void>, AsyncGenerator<C, void, void>) => AsyncGenerator<A | B | C, void, void>

const combine: CombineAsyncGenerators = combineImplementation
export default combine
