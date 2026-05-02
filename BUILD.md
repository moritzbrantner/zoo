# Build

This repository has three build surfaces: the Rust workspace, generated
contract artifacts, and the Bun/Vite visualization. Use the root `Makefile` for
day-to-day checks so those surfaces stay in sync.

## Prerequisites

- Rust 1.85 or newer
- Bun

Install frontend dependencies:

```sh
make frontend-install
```

## Common Commands

```sh
make check
make build
make test
make ci
```

`make check` validates `cargo check`, generated contracts, and frontend
TypeScript. `make build` builds the Rust workspace and the production
visualization bundle. `make test` runs both Rust tests and Playwright tests.

Regenerate contracts after changing API-facing Rust types:

```sh
make contracts
```

Start the visualization:

```sh
make frontend-dev
```
