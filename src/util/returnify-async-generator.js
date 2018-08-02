// @flow

type Maybe<T> = [Error, null] | [null, T]

/*
 * Returnify iterates through an async iterator and yields the values
 * as Maybe monads. If the async iterator throws an error, we continue
 * iterating through it after yielding a failed maybe monad.
 */
async function* returnify<T>(
  it: AsyncIterator<T>
): AsyncGenerator<Maybe<T>, void, void> {
  while (true) {
    try {
      for await (const v of it) {
        yield [null, v]
      }
      break;
    } catch (e) {
      yield [(e: Error), null]
    }
  }
}

export default returnify
