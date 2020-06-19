module.exports = isDevDep;

/**
 * @param node
 * @param name
 */
function isDevDep(node, name) {
  return node.package && node.package.devDependencies && node.package.devDependencies[name];
}
