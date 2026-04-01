const jwt = require("jsonwebtoken");

module.exports = {
  info: () => {
    const __dirname = 'some-dirname';
    const __filename = 'some-filename';
    console.log('__dirname', __dirname);
    console.log('__filename', __filename);
    return jwt.sign("info", "secret");
  },
};
