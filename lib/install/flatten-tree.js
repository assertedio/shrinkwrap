const validate = require('aproba');
const moduleName = require('../utils/module-name.js');

module.exports = flattenTree;
module.exports.flatName = flatName;
module.exports.flatNameFromTree = flatNameFromTree;

/**
 * @param tree
 */
function flattenTree(tree) {
  validate('O', arguments);
  const seen = new Set();
  const flat = {};
  const todo = [[tree, '/']];
  while (todo.length) {
    const next = todo.shift();
    const pkg = next[0];
    seen.add(pkg);
    let path = next[1];
    flat[path] = pkg;
    if (path !== '/') path += '/';
    for (let ii = 0; ii < pkg.children.length; ++ii) {
      const child = pkg.children[ii];
      if (!seen.has(child)) {
        todo.push([child, flatName(path, child)]);
      }
    }
  }
  return flat;
}

/**
 * @param path
 * @param child
 */
function flatName(path, child) {
  validate('SO', arguments);
  return path + (moduleName(child) || 'TOP');
}

/**
 * @param tree
 */
function flatNameFromTree(tree) {
  validate('O', arguments);
  if (tree.isTop) return '/';
  let path = flatNameFromTree(tree.parent);
  if (path !== '/') path += '/';
  return flatName(path, tree);
}
