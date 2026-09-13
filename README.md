# Zoo

A browser-first zoo management game with a compact, rotatable 3D isometric presentation inspired by classic management sims.

The project starts from a playable park loop, but it no longer treats "MVP" as permission to create parallel engine infrastructure inside Zoo. New vertical slices should use the intended shared foundations wherever they are already authoritative.

## Architecture

- **Rust (`crates/zoo-core`)** — deterministic Zoo simulation, placement, economy, guest movement, animal state, staff work, and save semantics.
- **`moritzbrantner/3d-lab`** — reusable renderer-independent camera, transform, mesh/asset, animation, and LOD semantics. Zoo owns game-specific scene composition and camera interaction policy, not generic 3D math.
- **`moritzbrantner/asset-tooling`** — reproducible generated/processed asset provenance and canonical asset operations used by Zoo assets.
- **`moritzbrantner/physics-engine`** — collision/rigid-body authority when future Zoo gameplay actually requires physical simulation. Ordinary tile placement/pathfinding stays game-specific.
- **WebAssembly** — thin browser boundaries around authoritative Rust behavior.
- **React + TypeScript (`apps/web`)** — HUD, management windows, touch/mouse/keyboard input, and the concrete renderer adapter.
- **No direct ECS Lab dependency** — `ecs-lab` remains an experiment harness; reusable ECS functionality must first become an intentional shared foundation.
- **No forced Maps dependency** — the current park is a game-space tile world, not a geographic MapLibre surface. Reuse `maps` only where a real shared spatial contract applies.

The current CSS pseudo-3D renderer is transitional. The architecture convergence plan replaces product-local camera/projection infrastructure with shared `3d-lab` contracts before deepening the 3D presentation further. See [`docs/architecture.md`](docs/architecture.md).

The simulation core owns the game rules. Presentation code does not duplicate placement, economy, camera projection, or physics logic.

## Run

Requirements: Rust, `wasm-pack`, Bun 1.4.

```sh
cargo test
cd apps/web
bun install
bun run dev
```

## Current playable loop

1. Extend the entrance path.
2. Place a habitat next to a path.
3. Inspect the habitat.
4. Adopt animals.
5. Rotate or tilt the current presentation while the shared 3D camera foundation is integrated.
6. Run the clock and watch guests, staff, animals, and operations react.

The product roadmap starts at GitHub issue #20. Architecture convergence is part of the roadmap rather than deferred generalized-engine work.
