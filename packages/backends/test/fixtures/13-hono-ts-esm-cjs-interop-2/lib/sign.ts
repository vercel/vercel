// @ts-ignore this tests a named import from cjs
import { sign as jsonwebtokenSign } from 'jsonwebtoken'
// @ts-ignore this tests importing a scoped cjs package (to verify flat shim paths)
import { typeOf } from '@sinonjs/commons'
// import jwt from 'jsonwebtoken'
// const { sign: jsonwebtokenSign } = jwt
// import commons from '@sinonjs/commons'
// const { typeOf } = commons

export const sign = (payload: any, secret: string) => {
  // Use typeOf to ensure the import is not tree-shaken
  console.log(typeOf(payload))
  return jsonwebtokenSign(payload, secret)
}
