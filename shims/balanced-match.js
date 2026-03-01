// Shim to provide a named `balanced` export used by ESM-built dependencies.
// This makes `import { balanced } from 'balanced-match'` work in Metro.
const b = require('balanced-match');

// export default for modules that expect a default
module.exports = b;
// named export used by some ESM bundles
module.exports.balanced = b;
// also provide `default` property for certain interop cases
module.exports.default = b;
