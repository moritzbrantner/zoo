# Generated Zoo web asset

`zoo-park-texture.asset.json` is the first real consumer proof for `asset-tooling`.

The generated `zoo-park-texture.svg` is deliberately not committed. Zoo's Verify and Pages workflows check out `moritzbrantner/asset-tooling` at the exact pinned commit, then use its public CLI to validate, generate, and replay-verify this spec before the web build. Vite copies the resulting SVG from `public/` into the deployed site and `index.html` consumes it as the Zoo park mark/favicon.

Generation receipts and the content-addressed cache stay under this directory's `.asset-tooling/` folder and remain disposable local/CI evidence.
