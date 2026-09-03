# Zoo

A fresh, browser-first zoo management game with a compact isometric presentation inspired by classic management sims.

The reboot deliberately starts small: build paths and habitats, adopt animals, admit guests, and watch money and park rating react to the simulation.

## Architecture

- **Rust (`crates/zoo-core`)** — deterministic simulation, placement, economy, guest movement, animal state.
- **WebAssembly** — thin browser boundary generated with `wasm-pack`.
- **React + TypeScript (`apps/web`)** — isometric renderer, HUD, management windows, and input.
- **No backend in the MVP** — the first playable loop runs entirely in the browser.

The simulation core owns the rules. React does not duplicate placement or economy logic.

## Run

Requirements: Rust, `wasm-pack`, Bun 1.4.

```sh
cargo test
cd apps/web
bun install
bun run dev
```

## MVP controls

1. Extend the entrance path.
2. Place a 4×3 habitat next to a path.
3. Switch to Inspect and select the habitat.
4. Adopt capybaras or flamingos.
5. Run the clock and watch guests arrive.

The project roadmap starts at GitHub issue #20. The playable MVP is #21.
