# Zoo agent guide

## Direction

Zoo is a game first. Prefer a playable management loop over generalized engine infrastructure.

## Boundaries

- Rust owns deterministic simulation rules and command validation.
- React/TypeScript owns presentation and interaction.
- Browser single-player is the default execution target until the core loop justifies server work.
- Keep commands idempotent where repeated deterministic work can reasonably be detected.
- Do not copy RollerCoaster Tycoon assets, text, maps, or proprietary UI; use it only as a reference for management-game readability and pacing.

## Verification

Before merging gameplay changes:

1. `cargo test`
2. Build the WASM package with `wasm-pack`.
3. `cd apps/web && bun install && bun run build`
4. Manually exercise the smallest affected playable loop.
