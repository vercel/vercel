interface BuilderParams {
  files: any,
  entrypoint: any,
  workPath: any,
  config: any
}

export function build (args: BuilderParams) {
  const { files, entrypoint } = args

  return {
    [entrypoint]: files[entrypoint]
  }
}
