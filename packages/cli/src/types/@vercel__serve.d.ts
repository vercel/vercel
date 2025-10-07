declare module '@vercel/serve' {
  export function serve(args: {
    entrypoint?: string;
    cwd?: string;
    repoRootPath?: string;
  }): Promise<void>;
}
