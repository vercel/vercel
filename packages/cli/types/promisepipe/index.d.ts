declare module 'promisepipe' {
  export default function (
    ...streams: (
      | NodeJS.ReadableStream
      | NodeJS.WritableStream
      | NodeJS.ReadWriteStream
    )[]
  ): Promise<void>;
}
