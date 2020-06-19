module.exports = isOptDep;

/**
 * @param node
 * @param name
 */
function isOptDep(node, name) {
  return node.package && node.package.optionalDependencies && node.package.optionalDependencies[name];
}
