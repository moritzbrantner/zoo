# Zoo architecture

Zoo is a game first, but it must not become a second implementation of generic engine infrastructure that already has an authority elsewhere in this workspace.

The architectural goal is the smallest playable vertical slice built on the intended long-term foundations, not the smallest self-contained amount of code.

## Authority map

| Concern | Authority | Zoo responsibility |
| --- | --- | --- |
| Park rules, money, placement validity, guest/animal decisions, staff work, saves | `zoo-core` | Own the deterministic game semantics and stable game IDs. |
| Zoo-specific scene framing, orbit/zoom policy, mapping game-space state toward shared scene contracts | `zoo-scene` | Adapt Zoo state without becoming a generic renderer or camera-math authority. |
| Camera matrices, transforms, renderer-independent mesh/asset semantics, animation primitives, LOD | `moritzbrantner/3d-lab` | Supply game-specific camera interaction policy and scene data; do not reimplement generic 3D math. |
| Generated/processed asset provenance, canonical asset catalog, reproducible 3D processing | `moritzbrantner/asset-tooling` | Declare Zoo asset intent and consume verified outputs. |
| Collision response, rigid-body motion, CCD, physical spatial queries | `moritzbrantner/physics-engine` | Integrate only where physical truth is part of gameplay; do not approximate engine behavior in React. |
| ECS storage experiments and benchmark evidence | `moritzbrantner/ecs-lab` | No direct runtime dependency. Reusable ECS functionality must first become an intentional shared foundation rather than being copied out of the lab. |
| Geographic/MapLibre map presentation and geo-data utilities | `moritzbrantner/maps` | No forced dependency for the current tile park. Reuse only a genuinely applicable data/spatial contract; Zoo owns its park-grid semantics. |
| React UI, touch/mouse/keyboard interaction, renderer adapter, HUD/windows | `apps/web` | Present authoritative Rust state and translate user intent into commands. Presentation must not own game balance, placement validity, camera projection math, or physics semantics. |

## Current correction

The current browser presentation grew from an MVP into a local pseudo-3D engine: CSS perspective/3D transforms, local yaw/pitch projection policy, object billboard compensation, and a large `App.tsx` all live in the product repository. That was useful to prove the game loop, but it is not the intended long-term authority boundary.

The migration therefore proceeds upstream-first:

1. Add the missing orthographic/isometric-capable camera primitive to `3d-lab` rather than extending Zoo's CSS camera math.
2. Use `zoo-scene` as the thin Zoo-owned adapter over an exact pinned `3d-lab` revision. It owns park framing, orbit steps, pitch bounds, and zoom policy while returning the shared `OrthographicCamera` contract.
3. Replace CSS pseudo-3D world projection incrementally with a real renderer adapter while keeping React for HUD and management interaction.
4. Move durable 3D assets through `asset-tooling`; use `3d-lab` for renderer-independent mesh/material/LOD semantics.
5. Keep path construction, habitat ownership, guest choices, welfare, economy, staff tasks, and other game-specific rules in `zoo-core`.
6. Add `physics-engine` only for interactions whose gameplay semantics require physical collision/motion truth. Tile occupancy and ordinary park pathfinding do not become physics problems merely because the game is rendered in 3D.

## Dependency policy

Cross-repository dependencies must be pinned to exact accepted revisions. If a required shared contract is unavailable or incompatible, validation should fail closed rather than silently falling back to a second local implementation.

`zoo-scene` is the first concrete enforcement of this policy: its shared camera and vector dependencies use one exact `3d-lab` commit. The pin must move only to another reviewed/accepted revision; it must not become a branch-tip dependency.

A local substitute is acceptable only when all of the following hold:

- the behavior is genuinely Zoo-specific, or the shared authority explicitly does not own it;
- the substitute does not establish a competing generic contract;
- the boundary and later migration cost are documented;
- deterministic/game-authoritative behavior remains in Rust.

## Rendering boundary

`zoo-core` emits stable game state and game-space coordinates. `zoo-scene` maps the presentation-facing parts into shared camera/scene semantics. The concrete browser renderer owns GPU/DOM objects only.

Camera orbit, zoom gestures, framing targets, and persistence are Zoo interaction policy. Projection/view math is shared 3D infrastructure. Selection and placement intent may originate in the renderer, but final validity remains a `zoo-core` decision.

Mobile and desktop inputs must converge on the same commands. Touch-specific gesture handling is presentation state and must not create a second rules path.

## Asset boundary

Zoo asset specifications and accepted generated outputs carry provenance through `asset-tooling`. Mesh/material/LOD processing remains owned by the corresponding `3d-lab` contracts and processors. Zoo may choose art direction and species/building requirements; it should not implement another generic asset pipeline.

## Physics boundary

The current management simulation does not need rigid-body physics for ordinary grid movement, placement, or guest pathfinding. When gameplay introduces physically meaningful interactions, Zoo should adapt stable Zoo entity IDs/state to `physics-engine` bodies and consume deterministic results back into the game simulation. React must never become the collision authority.

## ECS boundary

`ecs-lab` is evidence and experimentation, not the application runtime. If Zoo reaches a scale where an ECS materially improves simulation organization or performance, the reusable ECS contract should first be extracted into an explicit shared crate/repository, then adopted by Zoo. Copying a lab implementation directly into `zoo-core` would recreate the same ownership problem this architecture is intended to prevent.
