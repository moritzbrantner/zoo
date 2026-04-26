# Zoo

## Status

- Active vertical slice.
- Most complete game-specific implementation in this repo state.
- Repo-backed by the `zoo_game` crate, the slice-owned `zoo_server` app, generated contracts, and the `games/zoo/visualization` frontend.

## High-Level Pitch

Zoo is a deterministic management-game slice about operating a modern conservation park. The current implementation combines habitat construction, staff assignment, guest demand, pricing, animal welfare, and conservation progression into one simulation loop.

## Player Fantasy

The player is building a credible zoo operation rather than placing isolated decorations. The intended fantasy is to open habitats, keep animals healthy, staff the park correctly, tune guest-facing services, and turn operational competence into reputation and conservation progress.

## Current Implemented Experience

The current playable shape is grounded in `new_zoo_state`, `zoo_view`, the opening-day scenario helpers and end-to-end tests, and the server-backed or local `games/zoo/visualization` scene.

The simulation already exposes a seeded zoo map, guest-facing and staff-facing buildings, worker units, animal and guest NPCs, inventory and capacity management, tech nodes, upgrades, deterministic time advancement, command handling, and a summarized game view with alerts and objectives.

This is the strongest vertical slice in the repo because it has both game logic and external surfaces. The server DTOs, generated contracts, example, and visualization all point to the same operational model.

## Core Gameplay Loop

- Build habitats and support buildings on the zoo map.
- Assign staff to operational buildings and keep required roles filled.
- Supply feed, medicine, water, and related inputs so habitats and services stay functional.
- Add animals and activate habitats that raise appeal and conservation value.
- Attract guests, charge entry, and expand guest capacity and service coverage.
- Convert stable operations into reputation levels and conservation points.
- Avoid low welfare or depleted coin reserves while scaling the park.

## Core Systems

- Resources: coins, lumber, vegetables, meat, fish, animal feed, medicine, water, visitors, research points, reputation, and conservation points.
- Buildings: guest entry, plazas, restrooms, kiosks, souvenir stalls, keeper support buildings, veterinary and maintenance buildings, research buildings, and several habitat types.
- Staff units: zookeepers, veterinarians, mechanics, and educators.
- NPCs: guests plus animal groups such as zebras, lions, flamingos, tortoises, and parrots.
- Habitat activation: the summary layer tracks active habitats and exposes them as a core progress signal.
- Welfare and upkeep: animals carry stats such as welfare, hunger, health, and habitat-linked state.
- Guest demand and pricing: the summary exposes entry fee, customer willingness, demand percent, and expected customers per minute.
- Progression: reputation uses player level, while conservation points act as a second progress currency.
- Alerts and objectives: `zoo_view` emits concrete warnings and progress targets for the current state.

## World, Content, and Entities

The zoo slice is built on a 32x32 map with guest and service paths, habitat and staff zones, fences, areas, and placed buildings. The current content set supports both guest circulation and back-of-house operations rather than only a habitat sandbox.

The implementation treats animals and guests as NPCs layered onto the generic engine. Staff are explicit units. Buildings, fences, paths, and areas all contribute to the authored park layout and to the logic that drives operational readiness.

## Progression, Objectives, and Failure Pressure

The current encoded win pressure is explicit in `zoo_summary` and `zoo_objectives`:

- Activate 3 habitats.
- Reach reputation level 3.
- Earn 25 conservation points.
- Reach average animal welfare 70.

The current encoded failure pressure is also explicit:

- `critical` is set when coins drop below 10.
- `critical` is also set when any animal welfare value drops below 25.
- Alerts additionally warn on low coin reserve, zero animals, low average welfare, and visitor capacity saturation.

This means the current game is not only about expansion. It is about holding together finance, staffing, welfare, and guest throughput at the same time.

## Current Interfaces and Surfaces

- Rust crate: `games/zoo` exposes catalog setup, seeded state creation, world creation, logic hooks, view generation, checksums, and command helpers.
- JSON DTOs: the crate defines request and response types for world creation, command application, and ticking.
- Server: `games/zoo/server` exposes authoritative JSON endpoints for dev worlds and player commands.
- Visualization: `games/zoo/visualization` can run against the server or fall back to a local demo path.
- Generated contracts: the repo contains generated JSON schemas and TypeScript types for zoo-facing surfaces.
- Example and tests: `examples/opening_day.rs`, `tests/guest_excitement.rs`, and the local contract generator capture the slice surface that will move with the zoo repository.

## Constraints and Known Gaps

- Content breadth is still narrow relative to a full zoo-management product.
- Scenario variety is limited. The repo strongly evidences a curated opening-day or seeded-start structure rather than a wide set of authored scenarios.
- Broader product layers such as long-form campaign framing, monetization design, live-ops structure, or deep visitor storytelling are not present.
- The simulation is credible, but the content surface is still intentionally bounded.

## Near-Term Roadmap

The next coherent milestone is to deepen the existing vertical slice rather than widen the genre boundary.

- Increase the gameplay value of guest-service buildings relative to habitats so guest flow and spending pressure matter more.
- Add richer staffing pressure, especially around coverage, assignment tradeoffs, and animal-service dependencies.
- Expand scenario progression beyond the single strongest opening flow while staying within the same zoo-operations frame.
- Preserve the current server, contracts, and visualization as the main integration surfaces instead of inventing a new campaign or live-service layer.

## Source Anchors

- [../../README.md](../../README.md)
- [src/lib.rs](src/lib.rs)
- [examples/opening_day.rs](examples/opening_day.rs)
- [tests/guest_excitement.rs](tests/guest_excitement.rs)
- [tools/contract_codegen/src/main.rs](tools/contract_codegen/src/main.rs)
- [visualization/README.md](visualization/README.md)
