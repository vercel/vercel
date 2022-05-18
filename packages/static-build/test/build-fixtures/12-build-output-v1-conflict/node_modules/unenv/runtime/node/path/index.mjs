import * as _path from "pathe";
export * from "pathe";
const _pathModule = {
  ..._path,
  platform: "posix",
  posix: void 0,
  win32: void 0
};
_pathModule.posix = _pathModule;
_pathModule.win32 = _pathModule;
export const posix = _pathModule;
export const win32 = _pathModule;
export const platform = "posix";
export default _pathModule;
