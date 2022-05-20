declare module 'promisepipe' {
  export default function (
    ...streams: Array<
      NodeJS.ReadableStream | NodeJS.WritableStream | NodeJS.ReadWriteStream
    >
  ): Promise<void>;
}
