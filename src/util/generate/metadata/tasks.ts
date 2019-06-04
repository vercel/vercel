import { Locale } from '../helpers'

export type Task = { 
  locale: Locale
}

export const upload: Task = {
  locale: {
    single: 'This is a dependency of my code',
    many: 'These are dependencies of my code'
  }
}
export const ignore: Task = {
  locale: {
    single: 'This is a meta file',
    many: 'These are meta files'
  }
}
export const destructure: Task = {
  locale: {
    single: 'This file is built with multiple builders',
    many: 'These files are built with multiple builders'
  }
}
export const manual: Task = {
  locale: {
    single: 'This file was not detected properly',
    many: 'These files were not detected properly'
  }
}
