export const internal = [
  'upload',
  'ignore',
  'destructure'
]

export const extensions: {
  [key: string]: string[]
} = {
  '.js': [
    '@now/node',
    '@now/node-server',
    '@now/static'
  ],
  '.ts': [
    '@now/node',
    '@now/node-server'
  ],
  '.html': ['@now/static'],
  '.htm': ['@now/static'],
  '.css': ['@now/static'],
  '.rs': ['@now/rust'],
  '.md': ['@now/md'],
  '.markdown': ['@now/md'],
  '.mdx': ['@now/mdx-deck'],
  '.go': ['@now/go'],
  '.php': ['@now/php'],
  '.py': ['@now/python']
}

export const locale: {
  [key: string]: {
    single: string,
    many: string
  }
} = {
  '@now/static': {
    single: 'This is a public static file',
    many: 'These are public static files'
  },
  '@now/static-build': {
    single: 'This file needs to be built as static',
    many: 'These files need to be built as static'
  },
  '@now/next': {
    single: 'This is a Next.js project',
    many: 'This is a Next.js project'
  },
  '@now/node': {
    single: 'This is a Node.js lambda',
    many: 'Each of these are indivudual Node.js endpoints'
  },
  '@now/node-server': {
    single: 'This is Node.js app listening on a port',
    many: 'These form a Node.js app listening on a port'
  },
  '@now/mdx-deck': {
    single: 'This is an MDX Deck Slide',
    many: 'These are MDX Deck Slides'
  },
  'gatsby': {
    single: 'This is a Gatsby project',
    many: 'This is a Gatsby project'
  },
  upload: {
    single: 'This is a dependancy of my code',
    many: 'These are dependancies of my code'
  },
  ignore: {
    single: 'This is a meta file',
    many: 'These are meta files'
  },
  destructure: {
    single: 'This file is built with multiple builders',
    many: 'These files are built with multiple builders'
  }
}
