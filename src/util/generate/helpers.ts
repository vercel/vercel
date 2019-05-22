import { writeFile } from 'fs'
import { join } from 'path'
// @ts-ignore
import listInput from '../input/list'

export type IgnoreType = Set<string>

export type outputFileType = (dir: string, name: string, contents: string, overwrite?: boolean) => Promise<boolean>
export const outputFile: outputFileType = (dir, name, contents, overwrite) => {
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

export type chooseType = (message: string, options: {[key: string]: string}) => Promise<string>
export const choose: chooseType = async (message, options) => {
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
