import { Build } from '../generate-project'
import { next, staticBuild } from './builders'

export type Framework = {
  use: string,
  locale?: string
  build?: string
  config?: { [key: string]: string }
  dev?: string
}

export type Detector<T extends {}> = {
  parseManifest: (contents: Promise<string>) => Promise<T>
  hasBuild: (manifest: T) => Build | false
  detectors: Array<(contents: T) => Framework | false>
  addScripts: (contents: T, scripts: { build?: string, dev?: string }) => string | false
}

const node: Detector<{
  dependencies?: {
    next?: string
    gatsby?: string
    'mdx-deck'?: string
  }
  scripts?: {
    build?: string
    'now-dev'?: string
    'now-build'?: string
  }
}> = {
  parseManifest: async (contents) => JSON.parse(await contents),
  hasBuild: ({ scripts }) => scripts && scripts.build ? { use: '@now/static-build' } as Build : false,
  detectors: [
    ({ dependencies }) => (
      Boolean(dependencies && dependencies.next)
      && {
        locale: 'This is a Next.js project',
        use: next.use,
        build: 'next build'
      } as Framework
    ),
    ({ dependencies }) => (
      Boolean(dependencies && dependencies.gatsby)
      && {
        locale: 'This is a Gatsby project',
        use: staticBuild.use,
        dev: 'gatsby develop -p $PORT',
        build: 'gatsby build',
        config: {
          distDir: 'public'
        }
      } as Framework
    ),
    ({ dependencies }) => (
      Boolean(dependencies && dependencies['mdx-deck'])
      && {
        locale: 'This is an MDX Deck project',
        dev: 'mdx-deck dev',
        build: 'mdx-deck build',
        use: staticBuild.use,
      } as Framework
    )
  ],
  addScripts: (contents, { build, dev }) => {
    let needsUpdate = false

    if (!contents.scripts) contents.scripts = {}
    if (!contents.scripts['now-dev'] && dev) {
      contents.scripts['now-dev'] = dev
      needsUpdate = true
    }

    if (!contents.scripts['now-build'] && build) {
      contents.scripts['now-build'] = build
      needsUpdate = true
    }

    return needsUpdate && JSON.stringify(contents, null, 2)
  }
}

export default {
  'package.json': node
} as {
  [key: string]: Detector<Object>
}
