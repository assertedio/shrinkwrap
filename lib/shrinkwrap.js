const BB = require('bluebird');

const path = require('path');
const readPackageTree = require('read-package-tree');
const ssri = require('ssri');
const validate = require('aproba');
const unixFormatPath = require('./utils/unix-format-path.js');
const isRegistry = require('./utils/is-registry.js');
const moduleName = require('./utils/module-name.js');
const isOnlyDev = require('./install/is-only-dev.js');
const isOnlyOptional = require('./install/is-only-optional.js');
const id = require('./install/deps.js');
const getRequested = require('./install/get-requested.js');

module.exports = exports = shrinkwrap;
exports.treeToShrinkwrap = treeToShrinkwrap;

/**
 * @param root
 */
function shrinkwrap(root) {
  return readPackageTree(root)
    .then(id.computeMetadata)
    .then((tree) => BB.fromNode((cb) => createShrinkwrap(tree, cb)));
}

module.exports.createShrinkwrap = createShrinkwrap;

/**
 * @param tree
 * @param cb
 */
function createShrinkwrap(tree, cb) {
  cb(null, treeToShrinkwrap(tree));
}

/**
 * @param tree
 */
function treeToShrinkwrap(tree) {
  validate('O', arguments);
  const pkginfo = {};
  if (tree.package.name) pkginfo.name = tree.package.name;
  if (tree.package.version) pkginfo.version = tree.package.version;
  if (tree.children.length) {
    pkginfo.requires = true;
    shrinkwrapDeps((pkginfo.dependencies = {}), tree, tree);
  }
  return pkginfo;
}

/**
 * @param deps
 * @param top
 * @param tree
 * @param seen
 */
function shrinkwrapDeps(deps, top, tree, seen) {
  validate('OOO', [deps, top, tree]);
  if (!seen) seen = new Set();
  if (seen.has(tree)) return;
  seen.add(tree);
  sortModules(tree.children).forEach(function (child) {
    const childIsOnlyDev = isOnlyDev(child);
    const pkginfo = (deps[moduleName(child)] = {});
    const requested = getRequested(child) || child.package._requested || {};
    const linked = child.isLink || child.isInLink;
    pkginfo.version = childVersion(top, child, requested);
    if (requested.type === 'git' && child.package._from) {
      pkginfo.from = child.package._from;
    }
    if (child.fromBundle && !linked) {
      pkginfo.bundled = true;
    } else {
      if (isRegistry(requested)) {
        pkginfo.resolved = child.package._resolved;
      }
      // no integrity for git deps as integrity hashes are based on the
      // tarball and we can't (yet) create consistent tarballs from a stable
      // source.
      if (requested.type !== 'git') {
        pkginfo.integrity = child.package._integrity || undefined;
        if (!pkginfo.integrity && child.package._shasum) {
          pkginfo.integrity = ssri.fromHex(child.package._shasum, 'sha1');
        }
      }
    }
    if (childIsOnlyDev) pkginfo.dev = true;
    if (isOnlyOptional(child)) pkginfo.optional = true;
    if (child.requires.length) {
      pkginfo.requires = {};
      sortModules(child.requires).forEach((required) => {
        const requested = getRequested(required, child) || required.package._requested || {};
        pkginfo.requires[moduleName(required)] = childRequested(top, required, requested);
      });
    }
    // iterate into children on non-links and links contained within the top level package
    if (child.children.length) {
      pkginfo.dependencies = {};
      shrinkwrapDeps(pkginfo.dependencies, top, child, seen);
    }
  });
}

/**
 * @param modules
 */
function sortModules(modules) {
  // sort modules with the locale-agnostic Unicode sort
  const sortedModuleNames = modules.map(moduleName).sort();
  return modules.sort((a, b) => sortedModuleNames.indexOf(moduleName(a)) - sortedModuleNames.indexOf(moduleName(b)));
}

/**
 * @param top
 * @param child
 * @param req
 */
function childVersion(top, child, req) {
  if (req.type === 'directory' || req.type === 'file') {
    return `file:${unixFormatPath(path.relative(top.path, child.package._resolved || req.fetchSpec))}`;
  }
  if (!isRegistry(req) && !child.fromBundle) {
    return child.package._resolved || req.saveSpec || req.rawSpec;
  }
  if (req.type === 'alias') {
    return `npm:${child.package.name}@${child.package.version}`;
  }
  return child.package.version;
}

/**
 * @param top
 * @param child
 * @param requested
 */
function childRequested(top, child, requested) {
  if (requested.type === 'directory' || requested.type === 'file') {
    return `file:${unixFormatPath(path.relative(top.path, child.package._resolved || requested.fetchSpec))}`;
  }
  if (requested.type === 'git' && child.package._from) {
    return child.package._from;
  }
  if (!isRegistry(requested) && !child.fromBundle) {
    return child.package._resolved || requested.saveSpec || requested.rawSpec;
  }
  if (requested.type === 'tag') {
    // tags are not ranges we can match against, so we invent a "reasonable"
    // one based on what we actually installed.
    return `^${child.package.version}`;
  }
  if (requested.saveSpec || requested.rawSpec) {
    return requested.saveSpec || requested.rawSpec;
  }
  if (child.package._from || (child.package._requested && child.package._requested.rawSpec)) {
    return child.package._from.replace(/^@?[^@]+@/, '') || child.package._requested.rawSpec;
  }
  return child.package.version;
}
