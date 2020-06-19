module.exports = isProdDep;

/**
 * @param node
 * @param name
 */
function isProdDep(node, name) {
  return node.package && node.package.dependencies && node.package.dependencies[name];
}
