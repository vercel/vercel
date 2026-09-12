declare module 'promisepipe' {
  export default function pipe(
    ...streams: Array<
      NodeJS.ReadableStream | NodeJS.WritableStream | NodeJS.ReadWriteStream
    >
  ): Promise<void>;
}
