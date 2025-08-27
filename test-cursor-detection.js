const { execSync } = require('child_process');

function safeExecSync(command, options = {}) {
  try {
    return execSync(command, {
      stdio: 'pipe',
      encoding: 'utf8',
      ...options,
    });
  } catch (error) {
    return { error: error.message, stderr: error.stderr?.toString() || '' };
  }
}

// Test Cursor detection
const cursorCheck = safeExecSync(
  process.platform === 'darwin'
    ? 'ls /Applications/Cursor.app'
    : process.platform === 'win32'
      ? 'where cursor'
      : 'which cursor'
);

console.log('Platform:', process.platform);
console.log('Cursor check result:', cursorCheck);

if (typeof cursorCheck === 'object' && 'error' in cursorCheck) {
  console.log('❌ Cursor not detected');
} else {
  console.log('✅ Cursor detected');
}
