declare module 'serve-handler/src/directory' {
  interface File {
    relative: string;
    title: string;
    type: string;
    ext: string;
    base: string;
  }

  interface Path {
    name: string;
    url: string;
  }

  interface Spec {
    files?: File[];
    paths?: Path[];
    directory: string;
  }

  export default function(spec: Spec): string;
}
