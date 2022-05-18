'use strict';

const fs = require('fs');
const mime = require('mime');

const getPathByBasePath = require('./paths').getPathByBasePath;

const readFileAsync = (filePath) => {
    return new Promise((resolve, reject) => {
        fs.readFile(filePath, (err, data) => {
            if (err) {
                reject(err);
            }
            resolve(data);
        });
    });
};

const existFileAsync = (filePath) => {
    return new Promise((resolve) =>
        fs.access(filePath, (err) => {
            resolve(!err);
        })
    );
};

const findExistsPath = (paths) => {
    let resolved = false;

    return new Promise((resolve, reject) => {
        const findPromises = paths.map((path) => {
            return existFileAsync(path).then((isExists) => {
                if (!resolved && isExists) {
                    resolved = true;
                    resolve(path);
                }
            });
        });

        Promise.all(findPromises).then(() => {
            if (!resolved) {
                reject();
            }
        });
    });
};

/**
 *
 * @param {PostcssUrl~Asset} asset
 * @param {PostcssUrl~Options} options
 * @param {PostcssUrl~Dir} dir
 * @param {Function} warn
 * @returns {Promise<PostcssUrl~File | Undefined>}
 */
const getFile = (asset, options, dir, warn) => {
    const paths = options.basePath
        ? getPathByBasePath(options.basePath, dir.from, asset.pathname)
        : [asset.absolutePath];

    return findExistsPath(paths)
        .then((path) => readFileAsync(path)
            .then((contents) => {
                return {
                    path,
                    contents,
                    mimeType: mime.getType(path)
                };
            })
        )
        .catch(() => {
            warn(`Can't read file '${paths.join()}', ignoring`);

            return;
        });
};

module.exports = getFile;

/**
 * @typedef {Object} PostcssUrl~File
 * @property {String} path
 * @property {Buffer} contents
 * @property {String} mimeType
 */
