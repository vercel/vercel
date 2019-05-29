declare module 'dependency-tree' {
  interface Options {
    filename: string,
    directory: string
  }

  export function toList(options: Options): Array<string>;
}
