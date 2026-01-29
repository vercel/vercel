// @ts-ignore this tests a named import from cjs
import { sign as jsonwebtokenSign } from 'jsonwebtoken'

export const sign = (payload: any, secret: string) => {
  return jsonwebtokenSign(payload, secret)
}
