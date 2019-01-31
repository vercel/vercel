const fs = require('fs');
const path = require('path');

function readdir(dir) {
  return new Promise((resolve, reject) => {
    fs.readdir(dir, (err, files) => {
      if (err != null) {
        return reject(err);
      }

      return resolve(files);
    });
  });
}

function exists(p) {
  return new Promise((resolve, reject) => {
    fs.exists(p, (err, res) => {
      if (err != null) {
        return reject(err);
      }

      return resolve(res);
    });
  });
}

function stat(p) {
  return new Promise((resolve, reject) => {
    fs.stat(p, (err, stats) => {
      if (err != null) {
        return reject(err);
      }

      return resolve(stats);
    });
  });
}

async function inferCargoBinaries(cargoToml, srcDir) {
  const { package: pkg, bin } = cargoToml;
  const binaries = [];
  const hasMain = (await readdir(srcDir)).includes('main.rs');

  if (hasMain) {
    binaries.push(pkg.name);
  }

  // From: https://doc.rust-lang.org/cargo/reference/manifest.html#the-project-layout
  //   Do note, however, once you add a [[bin]] section (see below), Cargo will
  //   no longer automatically build files located in src/bin/*.rs. Instead you
  //   must create a [[bin]] section for each file you want to build.
  if (Array.isArray(bin)) {
    bin.forEach((binary) => {
      binaries.push(binary.name);
    });
  } else {
    const binDir = path.join(srcDir, 'bin');
    const filesInSrcBin = (await exists(binDir)) && (await stat(binDir)).isDirectory()
      ? await readdir(binDir)
      : [];

    filesInSrcBin.forEach((file) => {
      if (file.endsWith('.rs')) {
        binaries.push(file.slice(0, -3));
      }
    });
  }

  return binaries;
}

module.exports = inferCargoBinaries;
