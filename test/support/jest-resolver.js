// Jest 24 predates the `exports` map in package.json, which is how newer
// @smithy packages expose their submodules (`@smithy/core/serde`). Those
// requires appear only inside third-party code, so there is nothing to fix at
// the call site.
//
// The sibling problem - `node:`-prefixed builtin specifiers - is handled by a
// moduleNameMapper entry pointing at test/support/node-builtins, because jest
// resolves core modules before a custom resolver ever sees them.
//
// Upgrading jest removes the need for both.

const path = require('path');

const SUBMODULE_PACKAGES = ['@smithy/core', '@smithy/util-stream'];

module.exports = (request, options) => {
  const pkg = SUBMODULE_PACKAGES.find(name => request.startsWith(`${name}/`));
  if (pkg) {
    const submodule = request.slice(pkg.length + 1);
    if (submodule !== 'package.json') {
      const resolved = path.join(
        options.rootDir, 'node_modules', pkg, 'dist-cjs', 'submodules', submodule, 'index.js',
      );
      try {
        return options.defaultResolver(resolved, options);
      } catch (err) {
        // Fall through: not every subpath is a submodule directory.
      }
    }
  }

  return options.defaultResolver(request, options);
};
