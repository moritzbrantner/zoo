# Zoo Game Three.js Visualization

Three.js visualization for the zoo game. Buildings expose worker slot
requirements, and operational state is derived from assigned staff instead of a
scripted opening-day timeline. The build catalog and resource list come from
`src/assets/assetManifest.ts`, and the app can create a server-authoritative
dev world when `zoo_server` is running.

## Run

```sh
cd games/zoo/visualization
bun install
bun run dev
```

Open http://127.0.0.1:5173.

Optional server sync:

```sh
cargo run -p zoo_server
```

The app falls back to the local demo if the server is unavailable.

## Test

```sh
cd games/zoo/visualization
bun run test:e2e
```
