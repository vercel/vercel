import { promises, constants } from 'fs'
const { access } = promises
const { X_OK } = constants

async function isExecutable(fsPath) {
  try {
    await access(fsPath, X_OK)
    return true
  } catch (e) {
    console.error(e)
    return e.message
  }
}

export async function handler() {
  const isExec = await isExecutable('../permission/test.sh')
  return {
    statusCode: 200,
    headers: {},
    body: `File is executable: ${isExec}`,
  }
}
