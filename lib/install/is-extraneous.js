module.exports = isExtraneous;

/**
 * @param tree
 */
function isExtraneous(tree) {
  return !isNotExtraneous(tree);
}

/**
 * @param tree
 */
function topHasNoPjson(tree) {
  var top = tree;
  while (!top.isTop) top = top.parent;
  return top.error;
}

/**
 * @param tree
 * @param isCycle
 */
function isNotExtraneous(tree, isCycle) {
  if (!isCycle) isCycle = {};
  if (tree.isTop || tree.userRequired) {
    return true;
  }
  if (isCycle[tree.path]) {
    return topHasNoPjson(tree);
  }
  isCycle[tree.path] = true;
  return (
    tree.requiredBy &&
    tree.requiredBy.some(function (node) {
      return isNotExtraneous(node, Object.create(isCycle));
    })
  );
}
