# Rust Tile-Mask Placement

Building placement uses Rust tile-mask validation shared by the authoritative server and the WASM-powered placement preview. Placement legality affects construction costs, jobs, occupied grid tiles, progression locks, and buildable-plot boundaries, so keeping those rules in Rust prevents the visualization from drifting into a separate placement simulation.
