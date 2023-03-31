module.exports = {
  dynamicImport: filepath => import(filepath).then(mod => mod.default),
};
