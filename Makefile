.PHONY: test wasm web verify

test:
	cargo test --workspace

wasm:
	cd crates/zoo-core && wasm-pack build --target web --out-dir ../../apps/web/src/wasm --out-name zoo_core

web: wasm
	cd apps/web && bun install && bun run build

verify:
	cargo fmt --all --check
	cargo clippy --workspace --all-targets -- -D warnings
	cargo test --workspace
	$(MAKE) web
