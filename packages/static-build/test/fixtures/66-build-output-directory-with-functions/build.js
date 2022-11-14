const { execSync } = require('child_process');

execSync('cp -r fake .vercel_build_output');

// Download Go
const tarName = 'go1.14.1.linux-amd64.tar.gz';
const url = `https://dl.google.com/go/${tarName}`;
console.log(`Download Go from "${url}"`);
execSync(`curl ${url} > ${tarName}`, { stdio: 'inherit' });
execSync(`tar -xf ${tarName}`, { stdio: 'inherit' });

const execPath = `./go/bin/go`;

// Create the binary
execSync(`mkdir -p ${__dirname}/.vercel_build_output/functions/go-site`, {
  stdio: 'inherit',
});
execSync(`${execPath} get github.com/vercel/go-bridge/go/bridge`, {
  stdio: 'inherit',
});
execSync(
  `${execPath} build -o ${__dirname}/.vercel_build_output/functions/go-site/index ./go-source/main.go`,
  { stdio: 'inherit' }
);
