const Module = require('module');
const originalRequire = Module.prototype.require;

Module.prototype.require = function (id) {
  const result = originalRequire.apply(this, arguments);

  // Check if this is express by looking at the module structure
  if (
    id.includes('express') &&
    typeof result === 'function' &&
    result.application
  ) {
    console.log('=== INTERCEPTED EXPRESS ===');
    console.log('ID:', id);
    console.log('Has application:', !!result.application);
    console.log('Has Router:', !!result.Router);
    console.log('Has static:', !!result.static);
  }

  return result;
};

console.log('Loader installed');
