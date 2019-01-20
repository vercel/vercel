interface BuilderParams {
  files: any,
  entrypoint: any,
  workPath: any,
  config: any
}

function build (args: BuilderParams) {
  const { files, entrypoint, workPath, config } = args
  console.log(files, entrypoint, workPath, config);
}

export default {
  build
}
