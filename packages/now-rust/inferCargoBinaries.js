const { exists, readdir, stat } = require('fs-extra');
const path = require('path');

async function inferCargoBinaries(cargoToml, srcDir) {
  const { package: pkg, bin } = cargoToml;
  const binaries = [];
  const hasMain = await exists(path.join(srcDir, 'main.rs'));

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
