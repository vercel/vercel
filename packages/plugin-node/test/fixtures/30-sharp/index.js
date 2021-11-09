const { readFileSync } = require('fs');
const { join } = require('path');
const sharp = require('sharp');

module.exports = async (req, res) => {
  const file = readFileSync(join(__dirname, 'monkey.jpg'));
  const image = sharp(file).resize({
    height: 100,
    width: 100,
  });
  const buffer = await image.jpeg().toBuffer();
  if (buffer.length > 0) {
    res.end('sharp:RANDOMNESS_PLACEHOLDER');
  } else {
    res.end('buffer is empty');
  }
};
