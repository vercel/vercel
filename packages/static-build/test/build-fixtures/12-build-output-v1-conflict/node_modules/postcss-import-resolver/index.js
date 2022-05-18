const {
  NodeJsInputFileSystem,
  CachedInputFileSystem,
  ResolverFactory
} = require('enhanced-resolve')

module.exports = (config = {}) => {
  const defaultConfig = {
    extensions: ['.css'],
    mainFields: ['style', 'main'],
    modules: ['node_modules'],
    fileSystem: config.fileSystem
      ? null
      : new CachedInputFileSystem(new NodeJsInputFileSystem(), 4000),
    useSyncFileSystemCalls: true
  }
  const resolver = ResolverFactory.createResolver(
    Object.assign(defaultConfig, config)
  )

  return (id, basedir) => resolver.resolveSync({}, basedir, id)
}
