import { writeFile } from 'fs'
import { join } from 'path'
// @ts-ignore
import listInput from '../input/list'

export function outputFile(dir: string, name: string, contents: string, overwrite: boolean = false): Promise<boolean> {
  return new Promise((resolve) => {
    const file = new Uint8Array(Buffer.from(`${contents}\n`))
    const flag = overwrite ? 'w' : 'wx'

    writeFile(join(dir, name), file, { flag, encoding: 'utf8' }, (err) => {
      if (err) {
        if (err.code !== 'EEXIST') throw err
        resolve(false)
      }
      resolve(true)
    })
  })
}

export async function choose(message: string, options: {[key: string]: string}) {
  const choices = Object.keys(options).map(name => ({
    name: `${options[name]} (${name})`,
    value: name,
    short: name
  }))

  return listInput({
    message,
    separator: false,
    choices
  })
}
