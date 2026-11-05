Re-exports of Node builtins under their bare names.

Jest 24 does not recognize `node:`-prefixed specifiers as core modules, so
`require('node:crypto')` inside the AWS SDK's dependency tree fails to resolve.
A `moduleNameMapper` entry rewrites `node:x` to the shim of the same name here.

Only the builtins the SDK actually reaches for are listed; add one if a new
dependency needs it. Upgrading jest removes the need for all of this.
