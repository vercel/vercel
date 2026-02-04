const fs = require("fs");
const { join } = require("node:path");

module.exports = {
  info: () => {
    const pathToTxt = join(__dirname, "info-for-cjs-read.txt");
    return fs.readFileSync(pathToTxt, "utf8");
  },
};
