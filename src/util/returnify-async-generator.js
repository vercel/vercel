// @flow

type Maybe<T> = [Error, null] | [null, T]

async function* returnify<T>(
  it: AsyncIterator<T>
): AsyncGenerator<Maybe<T>, void, void> {
  while (true) {
    try {
      for await (const v of it) {
        yield [null, v]
      }
    } catch (e) {
      yield [(e: Error), null]
    }
  }
}

export default returnify
