# npm-bulk-download

A handy tool that downloads and extracts npm package tarballs.

> Note: This tool does not install dependencies.

## Usage

You can specify one or more packages to download such as:

    node index.js out somepackage1 somepackage2

If you have several packages, then pipe a file into the app:

    cat packages.txt | node index.js out
