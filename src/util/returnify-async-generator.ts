type Maybe<T> = [Error, null] | [null, T];

/*
 * Returnify iterates through an async generator and yields the values
 * as Maybe monads. If the async iterator throws an error, and andother call to
 * the iterator is made, the generator is used to reinstantiate an iterator and
 * iteration is restarted.
 */
export default async function* returnify<T>(
  gx: () => AsyncIterable<T>
): AsyncIterable<Maybe<T>> {
  let it = gx();
  while (true) {
    try {
      for await (const v of it) {
        yield [null, v];
      }
      break;
    } catch (e) {
      yield [e as Error, null];
      it = gx();
    }
  }
}
