const {
  promises: { access },
  constants: { X_OK },
} = require('fs')

async function isExecutable(fsPath) {
  console.log(`Testing is file is executable: ${fsPath}`)
  try {
    await access(fsPath, X_OK)
    return true
  } catch (e) {
    console.error(e)
    return e.message
  }
}

async function handler() {
  const isExec = await isExecutable(module.id)
  return {
    statusCode: 200,
    headers: {},
    body: `File is executable: ${isExec}`,
  }
}

module.exports = { handler }
