"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sharedLibEmit = void 0;
const os_1 = __importDefault(require("os"));
const glob_1 = __importDefault(require("glob"));
const get_package_base_1 = require("./get-package-base");
let sharedlibGlob = '';
switch (os_1.default.platform()) {
    case 'darwin':
        sharedlibGlob = '/**/*.@(dylib|so?(.*))';
        break;
    case 'win32':
        sharedlibGlob = '/**/*.dll';
        break;
    default:
        sharedlibGlob = '/**/*.so?(.*)';
}
// helper for emitting the associated shared libraries when a binary is emitted
async function sharedLibEmit(path, job) {
    // console.log('Emitting shared libs for ' + path);
    const pkgPath = get_package_base_1.getPackageBase(path);
    if (!pkgPath)
        return;
    const files = await new Promise((resolve, reject) => glob_1.default(pkgPath + sharedlibGlob, { ignore: pkgPath + '/**/node_modules/**/*' }, (err, files) => err ? reject(err) : resolve(files)));
    await Promise.all(files.map(file => job.emitFile(file, 'sharedlib', path)));
}
exports.sharedLibEmit = sharedLibEmit;
;
