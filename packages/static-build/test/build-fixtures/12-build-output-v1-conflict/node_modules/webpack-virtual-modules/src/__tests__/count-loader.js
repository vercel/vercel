let modulesBuilt = 0;

module.exports = function(source) {
  this.cacheable(true);
  const callback = this.async();
  modulesBuilt++;
  callback(null, source);
}

module.exports.loader = __filename;
module.exports.modulesBuilt = function() {
  return modulesBuilt;
};
