declare module 'epipebomb' {
  export default function (
    stream?: NodeJS.WritableStream,
    callback?: () => void
  ): void;
}
