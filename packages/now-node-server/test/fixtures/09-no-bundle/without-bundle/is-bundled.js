const path = require('path');

module.exports = () => path.basename(__filename) === 'index.js';
