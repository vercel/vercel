interface BuilderParams {
  files: any,
  entrypoint: any,
  workPath: any,
  config: any
}

function build (args: BuilderParams) {
  const { files, entrypoint } = args

  return {
    [entrypoint]: files[entrypoint]
  }
}

export default {
  build
}
