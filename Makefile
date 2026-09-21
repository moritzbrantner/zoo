.PHONY: test wasm web verify assets assets-development assets-production assets-validate

test:
	cargo test --workspace

wasm:
	cd crates/zoo-core && wasm-pack build --target web --out-dir ../../apps/web/src/wasm --out-name zoo_core
	cd crates/zoo-scene && wasm-pack build --target web --out-dir ../../apps/web/src/scene-wasm --out-name zoo_scene

web: wasm
	cd apps/web && bun install && bun run build

assets-development:
	blender --background --python tools/build_assets.py -- --stage development

assets-production:
	blender --background --python tools/build_assets.py -- --stage production

assets: assets-development assets-production

assets-validate:
	blender --background --python tools/build_assets.py -- --validate

verify:
	cargo fmt --all --check
	cargo clippy --workspace --all-targets -- -D warnings
	cargo test --workspace
	$(MAKE) web
