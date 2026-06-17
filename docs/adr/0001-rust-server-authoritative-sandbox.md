# Rust Server Authoritative Sandbox

The sandbox gameplay state is authoritative in Rust and the server, not duplicated in frontend simulation logic. The long-term tycoon economy needs deterministic server-side rules, generated contracts, persistence, tests, and less drift between the demo UI and the actual game model; frontend local fallback should remain only explicit test or demo scaffolding.
