# Zoo agent guide

## Direction

Zoo is a game first. Prefer a playable management loop, but build it on the intended long-term foundations rather than creating product-local substitutes for generic engine capabilities.

Before implementing a new subsystem, check `docs/architecture.md` and the existing workspace authorities. The smallest acceptable slice is the smallest playable slice on the correct authority boundary, not the smallest self-contained code sample.

## Boundaries

- `zoo-core` owns deterministic Zoo simulation rules, command validation, stable game IDs, economy, placement, guest/animal decisions, staff work, and save semantics.
- `moritzbrantner/3d-lab` owns reusable renderer-independent camera, transform, mesh/asset, animation, and LOD semantics. Zoo owns camera interaction policy and scene composition, not generic projection math.
- `moritzbrantner/asset-tooling` owns reproducible asset generation/processing provenance and canonical asset operations. Zoo owns art/content requirements and consumes verified outputs.
- `moritzbrantner/physics-engine` owns reusable collision, CCD, rigid-body response, and physical spatial-query semantics when Zoo actually needs them. Do not approximate those semantics in React or duplicate them in Zoo.
- `moritzbrantner/ecs-lab` is an experiment harness, not Zoo's ECS dependency. Extract a deliberate reusable ECS foundation before adopting lab storage code in the game.
- `moritzbrantner/maps` is not automatically the authority for Zoo's tile park. Reuse it only where an actual geo/spatial contract fits; Zoo retains park-grid semantics.
- React/TypeScript owns HUD, windows, renderer adaptation, and mouse/touch/keyboard interaction. It must not duplicate placement, balance, camera projection, or physics logic.
- Browser single-player remains the default execution target until multiplayer/server behavior is an explicit product slice.
- Keep commands idempotent where repeated deterministic work can reasonably be detected.
- Pin cross-repository foundations to exact accepted revisions and fail closed on contract drift rather than silently falling back to local generic implementations.
- Do not copy RollerCoaster Tycoon assets, text, maps, or proprietary UI; use it only as a reference for management-game readability and pacing.

## Implementation questions

Ask before coding when a choice would alter a durable authority boundary, especially:

- whether a new behavior is Zoo-specific or belongs in `3d-lab`, `physics-engine`, `asset-tooling`, or another shared foundation;
- whether a physical interaction is intended to be simulation-backed or deliberately game-rule/grid based;
- whether a new reusable abstraction has a second real consumer or should stay local for now.

Do not ask again about boundaries already established above.

## Verification

Before merging gameplay changes:

1. Run `make verify` from the repository root. It performs Rust formatting, strict Clippy, workspace tests, the WASM build, dependency install, TypeScript compilation, and the production web build.
2. Let the pull request `Verify` workflow complete; it additionally exercises the repository's asset-tooling consumer and browser visual dogfood.
3. When foundation/configuration files covered by `.github/workflows/foundation-audit.yml` change, require that path-scoped `Foundation Fleet Audit` workflow as the coding-tooling check. Do not claim an equivalent local command exists unless one is added to the repository.
4. Manually exercise the smallest affected playable loop on desktop and, when input is affected, a phone-sized touch viewport. Camera/rendering changes must exercise the full orbit and both allowed tilt bounds, confirming the complete park footprint stays inside the renderer frame while projected controls remain aligned.
5. For pinned cross-repository contracts, verify the exact accepted revision rather than an unpinned branch tip.
