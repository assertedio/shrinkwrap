const path = require('path');
const semver = require('semver');
const npa = require('npm-package-arg');
const validate = require('aproba');
const { flatNameFromTree } = require('./flatten-tree.js');
const resetMetadata = require('./node.js').reset;
const packageId = require('../utils/package-id.js');
const moduleName = require('../utils/module-name.js');
const isDevDep = require('./is-dev-dep.js');
const isProdDep = require('./is-prod-dep.js');
const isExtraneous = require('./is-extraneous.js');

// The export functions in this module mutate a dependency tree, adding
// items to them.

const registryTypes = { range: true, version: true };

/**
 * @param child
 * @param requested
 * @param requestor
 */
function doesChildVersionMatch(child, requested, requestor) {
  if (child.fromShrinkwrap && !child.hasRequiresFromLock) return true;
  // ranges of * ALWAYS count as a match, because when downloading we allow
  // prereleases to match * if there are ONLY prereleases
  if (requested.type === 'range' && requested.fetchSpec === '*') return true;

  if (requested.type === 'directory') {
    if (!child.isLink) return false;
    return path.relative(child.realpath, requested.fetchSpec) === '';
  }

  if (requested.type === 'git' && child.fromShrinkwrap) {
    const fromSw = child.package._from ? npa(child.package._from) : child.fromShrinkwrap;
    fromSw.name = requested.name; // we're only checking specifiers here
    if (fromSw.toString() === requested.toString()) return true;
  }

  if (requested.type === 'git' && requested.gitRange) {
    const sameRepo = npa(child.package._from).fetchSpec === requested.fetchSpec;
    try {
      return sameRepo && semver.satisfies(child.package.version, requested.gitRange, true);
    } catch (error) {
      return false;
    }
  }

  if (requested.type === 'alias') {
    return doesChildVersionMatch(child, requested.subSpec, requestor);
  }

  if (!registryTypes[requested.type]) {
    const childReq = child.package._requested;
    if (childReq) {
      if (childReq.rawSpec === requested.rawSpec) return true;
      if (childReq.type === requested.type) {
        if (childReq.saveSpec === requested.saveSpec) return true;
        if (childReq.fetchSpec === requested.fetchSpec) return true;
      }
    }
    // If _requested didn't exist OR if it didn't match then we'll try using
    // _from. We pass it through npa to normalize the specifier.
    // This can happen when installing from an `npm-shrinkwrap.json` where `_requested` will
    // be the tarball URL from `resolved` and thus can't match what's in the `package.json`.
    // In those cases _from, will be preserved and we can compare that to ensure that they
    // really came from the same sources.
    // You'll see this scenario happen with at least tags and git dependencies.
    // Some buggy clients will write spaces into the module name part of a _from.
    if (child.package._from) {
      const fromReq = npa(child.package._from);
      if (fromReq.rawSpec === requested.rawSpec) return true;
      if (fromReq.type === requested.type && fromReq.saveSpec && fromReq.saveSpec === requested.saveSpec) return true;
    }
    return false;
  }
  try {
    return semver.satisfies(child.package.version, requested.fetchSpec, true);
  } catch (error) {
    return false;
  }
}

/**
 * @param tree
 * @param name
 * @param spec
 * @param where
 */
function childDependencySpecifier(tree, name, spec, where) {
  return npa.resolve(name, spec, where || packageRelativePath(tree));
}

exports.computeMetadata = computeMetadata;
/**
 * @param tree
 * @param seen
 */
function computeMetadata(tree, seen) {
  if (!seen) seen = new Set();
  if (!tree || seen.has(tree)) return;
  seen.add(tree);
  if (tree.parent == null) {
    resetMetadata(tree);
    tree.isTop = true;
  }
  tree.location = flatNameFromTree(
    /**
     *
     */
    tree
  );

  /**
   * @param name
   * @param spec
   * @param kind
   */
  function findChild(name, spec, kind) {
    try {
      var req = childDependencySpecifier(tree, name, spec);
    } catch (error) {
      return;
    }
    const child = findRequirement(tree, req.name, req);
    if (child) {
      resolveWithExistingModule(child, tree);
      return true;
    }
  }

  const deps = tree.package.dependencies || {};
  const reqs = tree.swRequires || {};
  for (const name of Object.keys(deps)) {
    if (findChild(name, deps[name])) continue;
    if (name in reqs && findChild(name, reqs[name])) continue;
    tree.missingDeps[name] = deps[name];
  }
  if (tree.isTop) {
    const devDeps = tree.package.devDependencies || {};
    for (const name of Object.keys(devDeps)) {
      if (findChild(name, devDeps[name])) continue;
      tree.missingDevDeps[name] = devDeps[name];
    }
  }

  tree.children.filter((child) => !child.removed).forEach((child) => computeMetadata(child, seen));

  return tree;
}

/**
 * @param tree
 * @param child
 */
function isDep(tree, child) {
  const name = moduleName(child);
  const prodVer = isProdDep(tree, name);
  const devVer = isDevDep(tree, name);

  try {
    var prodSpec = childDependencySpecifier(tree, name, prodVer);
  } catch (error) {
    return { isDep: true, isProdDep: false, isDevDep: false };
  }
  let matches;
  if (prodSpec) matches = doesChildVersionMatch(child, prodSpec, tree);
  if (matches) return { isDep: true, isProdDep: prodSpec, isDevDep: false };
  if (devVer === prodVer) return { isDep: child.fromShrinkwrap, isProdDep: false, isDevDep: false };
  try {
    const devSpec = childDependencySpecifier(tree, name, devVer);
    return { isDep: doesChildVersionMatch(child, devSpec, tree) || child.fromShrinkwrap, isProdDep: false, isDevDep: devSpec };
  } catch (error) {
    return { isDep: child.fromShrinkwrap, isProdDep: false, isDevDep: false };
  }
}

/**
 * @param tree
 * @param child
 */
function addRequiredDep(tree, child) {
  const dep = isDep(tree, child);
  if (!dep.isDep) return false;
  replaceModuleByPath(child, 'requiredBy', tree);
  replaceModuleByName(tree, 'requires', child);
  if (dep.isProdDep && tree.missingDeps) delete tree.missingDeps[moduleName(child)];
  if (dep.isDevDep && tree.missingDevDeps) delete tree.missingDevDeps[moduleName(child)];
  return true;
}

// exports.removeObsoleteDep = removeObsoleteDep
/**
 * @param child
 * @param log
 */
function removeObsoleteDep(child, log) {
  if (child.removed) return;
  child.removed = true;
  if (log) {
    log.silly('removeObsoleteDep', `removing ${packageId(child)} from the tree as its been replaced by a newer version or is no longer required`);
  }
  // remove from physical tree
  if (child.parent) {
    child.parent.children = child.parent.children.filter(function (pchild) {
      return pchild !== child;
    });
  }
  // remove from logical tree
  const requires = child.requires || [];
  requires.forEach(function (requirement) {
    requirement.requiredBy = requirement.requiredBy.filter(function (reqBy) {
      return reqBy !== child;
    });
    // we don't just check requirement.requires because that doesn't account
    // for circular deps.  isExtraneous does.
    if (isExtraneous(requirement)) removeObsoleteDep(requirement, log);
  });
}

exports.packageRelativePath = packageRelativePath;
/**
 * @param tree
 */
function packageRelativePath(tree) {
  if (!tree) return '';
  const requested = tree.package._requested || {};
  if (requested.type === 'directory') {
    return requested.fetchSpec;
  }
  if (requested.type === 'file') {
    return path.dirname(requested.fetchSpec);
  }
  if ((tree.isLink || tree.isInLink) && !preserveSymlinks()) {
    return tree.realpath;
  }
  return tree.path;
}

/**
 * @param pkg
 */
function getTop(pkg) {
  const seen = new Set();
  while (pkg.parent && !seen.has(pkg.parent)) {
    pkg = pkg.parent;
    seen.add(pkg);
  }
  return pkg;
}

/**
 * @param child
 * @param log
 */
function reportBundleOverride(child, log) {
  const code = 'EBUNDLEOVERRIDE';
  const top = getTop(child.fromBundle);
  const bundlerId = packageId(child.fromBundle);
  if (
    !top.warnings.some((w) => {
      return w.code === code;
    })
  ) {
    const err = new Error(
      `${bundlerId} had bundled packages that do not match the required version(s). They have been replaced with non-bundled versions.`
    );
    err.code = code;
    top.warnings.push(err);
  }
  if (log) log.verbose('bundle', `${code}: Replacing ${bundlerId}'s bundled version of ${moduleName(child)} with ${packageId(child)}.`);
}

/**
 * @param child
 * @param tree
 */
function resolveWithExistingModule(child, tree) {
  validate('OO', arguments);
  addRequiredDep(tree, child);
  if (tree.parent && child.parent !== tree) updatePhantomChildren(tree.parent, child);
}

var updatePhantomChildren = (exports.updatePhantomChildren = function (current, child) {
  validate('OO', arguments);
  while (current && current !== child.parent) {
    if (!current.phantomChildren) current.phantomChildren = {};
    current.phantomChildren[moduleName(child)] = child;
    current = current.parent;
  }
});

// exports._replaceModuleByPath = replaceModuleByPath
/**
 * @param obj
 * @param key
 * @param child
 */
function replaceModuleByPath(obj, key, child) {
  return replaceModule(obj, key, child, function (replacing, child) {
    return replacing.path === child.path;
  });
}

// exports._replaceModuleByName = replaceModuleByName
/**
 * @param obj
 * @param key
 * @param child
 */
function replaceModuleByName(obj, key, child) {
  const childName = moduleName(child);
  return replaceModule(obj, key, child, function (replacing, child) {
    return moduleName(replacing) === childName;
  });
}

/**
 * @param obj
 * @param key
 * @param child
 * @param matchBy
 */
function replaceModule(obj, key, child, matchBy) {
  validate('OSOF', arguments);
  if (!obj[key]) obj[key] = [];
  // we replace children with a new array object instead of mutating it
  // because mutating it results in weird failure states.
  // I would very much like to know _why_ this is. =/
  const children = [].concat(obj[key]);
  for (var replaceAt = 0; replaceAt < children.length; ++replaceAt) {
    if (matchBy(children[replaceAt], child)) break;
  }
  const replacing = children.splice(replaceAt, 1, child);
  obj[key] = children;
  return replacing[0];
}

// Determine if a module requirement is already met by the tree at or above
// our current location in the tree.
var findRequirement = (exports.findRequirement = function (tree, name, requested, requestor) {
  validate('OSO', [tree, name, requested]);
  if (!requestor) requestor = tree;
  const nameMatch = function (child) {
    return moduleName(child) === name && child.parent && !child.removed;
  };
  const versionMatch = function (child) {
    return doesChildVersionMatch(child, requested, requestor);
  };
  if (nameMatch(tree)) {
    // this *is* the module, but it doesn't match the version, so a
    // new copy will have to be installed
    return versionMatch(tree) ? tree : null;
  }

  let matches = tree.children.filter(nameMatch);
  if (matches.length) {
    matches = matches.filter(versionMatch);
    // the module exists as a dependent, but the version doesn't match, so
    // a new copy will have to be installed above here
    if (matches.length) return matches[0];
    return null;
  }
  if (tree.isTop) return null;
  if (!preserveSymlinks() && /^\.\.[/\\]/.test(path.relative(tree.parent.realpath, tree.realpath))) return null;
  return findRequirement(tree.parent, name, requested, requestor);
});

/**
 *
 */
function preserveSymlinks() {
  if (!('NODE_PRESERVE_SYMLINKS' in process.env)) return false;
  const value = process.env.NODE_PRESERVE_SYMLINKS;
  if (value == null || value === '' || value === 'false' || value === 'no' || value === '0') return false;
  return true;
}

// Find the highest level in the tree that we can install this module in.
// If the module isn't installed above us yet, that'd be the very top.
// If it is, then it's the level below where its installed.
var earliestInstallable = (exports.earliestInstallable = function (requiredBy, tree, pkg, log) {
  validate(
    /**
     *
     */
    'OOOO',
    arguments
  );

  /**
   * @param child
   */
  function undeletedModuleMatches(child) {
    return !child.removed && moduleName(child) === ((pkg._requested && pkg._requested.name) || pkg.name);
  }
  const undeletedMatches = tree.children.filter(undeletedModuleMatches);
  if (undeletedMatches.length) {
    // if there's a conflict with another child AT THE SAME level then we're replacing it, so
    // mark it as removed and continue with resolution normally.
    if (tree === requiredBy) {
      undeletedMatches.forEach((pkg) => {
        if (pkg.fromBundle) reportBundleOverride(pkg, log);
        removeObsoleteDep(pkg, log);
      });
    } else {
      return null;
    }
  }

  // If any of the children of this tree have conflicting
  // binaries then we need to decline to install this package here.
  const binaryMatches =
    pkg.bin &&
    tree.children.some(function (child) {
      if (child.removed || !child.package.bin) return false;
      return Object.keys(child.package.bin).some(function (bin) {
        return pkg.bin[bin];
      });
    });

  if (binaryMatches) return null;

  // if this tree location requested the same module then we KNOW it
  // isn't compatible because if it were findRequirement would have
  // found that version.
  const deps = tree.package.dependencies || {};
  if (!tree.removed && requiredBy !== tree && deps[pkg.name]) {
    return null;
  }

  const devDeps = tree.package.devDependencies || {};
  if (tree.isTop && devDeps[pkg.name]) {
    const requested = childDependencySpecifier(tree, pkg.name, devDeps[pkg.name]);
    if (!doesChildVersionMatch({ package: pkg }, requested, tree)) {
      return null;
    }
  }

  if (tree.phantomChildren && tree.phantomChildren[pkg.name]) return null;

  if (tree.isTop) return tree;
  if (tree.isGlobal) return tree;

  if (!preserveSymlinks() && /^\.\.[/\\]/.test(path.relative(tree.parent.realpath, tree.realpath))) return tree;

  return earliestInstallable(requiredBy, tree.parent, pkg, log) || tree;
});
