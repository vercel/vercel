const { join } = require('path');
const { tmpdir } = require('os');
const { mkdirSync, writeFileSync } = require('fs');

function getRandomId() {
  return Math.random()
    .toString()
    .slice(2);
}

function getRandomInt(min, max) {
  const diff = max - min;
  return Math.floor(Math.random() * diff) + min;
}

function getRandomText(wordCount) {
  return Array.from({ length: wordCount })
    .map(getRandomId)
    .join(' ');
}

function getRandomFileData() {
  const wordCount = getRandomInt(1000, 2000);
  return getRandomText(wordCount);
}

function createRandomFile(dir) {
  const fileName = getRandomId() + '.txt';
  const data = getRandomFileData();
  writeFileSync(join(dir, fileName), data, 'utf8');
}

function createRandomProject(dir, fileCount) {
  const nowJson = JSON.stringify(
    { version: 2, public: true, name: 'test' },
    null,
    ' '
  );
  writeFileSync(join(dir, 'now.json'), nowJson, 'utf8');
  const publicDir = join(dir, 'public');
  mkdirSync(publicDir);
  Array.from({ length: fileCount }).forEach(() => createRandomFile(publicDir));
}

function main(fileCount = 1000) {
  const randomTmpId = getRandomId();
  const dir = join(tmpdir(), 'now-benchmark' + randomTmpId);
  console.log(`Creating ${dir} with ${fileCount} random files...`);
  mkdirSync(dir);
  createRandomProject(dir, Number(fileCount));
  console.log(`Done. Run the following:`);
  console.log(`cd ${dir}`);
  console.log('time now --no-clipboard');
}

main(process.argv[2]);
