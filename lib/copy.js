// Packages
import {copy as _copy} from 'copy-paste'

export default function copy(text) {
  return new Promise((resolve, reject) => {
    _copy(text, err => {
      if (err) {
        return reject(err)
      }

      resolve()
    })
  })
}
