//      

// Packages
import { write } from 'clipboardy';

// $FlowFixMe
const _isTTY = process.stdout.isTTY;

async function copyToClipboard(
  str        ,
  shouldCopy                   = 'auto',
  isTTY          = _isTTY
) {
  if (shouldCopy === false) {
    return false;
  }

  if (shouldCopy === 'auto') {
    if (isTTY) {
      await write(str);
      return true;
    } 
      return false;
    
  }

  if (shouldCopy === true) {
    await write(str);
    return true;
  }

  throw new TypeError(
    'The `copyToClipbard` value in now config has an invalid type'
  );
}

export default copyToClipboard;
