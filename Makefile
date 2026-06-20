BUN ?= bun
CARGO ?= cargo
VISUALIZATION_DIR := visualization

.PHONY: help ci check build test rust-check rust-build rust-test contracts contracts-check wasm-build frontend-install frontend-typecheck frontend-build frontend-test frontend-dev frontend-preview clean

help:
	@printf '%s\n' \
		'Targets:' \
		'  make check              Validate Rust, contracts, and frontend types' \
		'  make build              Build the Rust workspace and visualization bundle' \
		'  make test               Run Rust tests and Playwright tests' \
		'  make ci                 Run check, build, and test' \
		'  make contracts          Regenerate contract artifacts' \
		'  make contracts-check    Fail if generated contracts are stale' \
		'  make frontend-dev       Start the visualization dev server'

ci: check build test

check: rust-check contracts-check frontend-typecheck

build: rust-build frontend-build

test: rust-test frontend-test

rust-check:
	$(CARGO) check --workspace --all-targets

rust-build:
	$(CARGO) build --workspace

rust-test:
	$(CARGO) test --workspace

contracts:
	$(CARGO) run -p zoo_contract_codegen

contracts-check:
	$(CARGO) run -p zoo_contract_codegen -- --check

wasm-build:
	wasm-pack build . --target web --out-dir $(VISUALIZATION_DIR)/src/wasm --out-name zoo_game --features wasm
	rm -f $(VISUALIZATION_DIR)/src/wasm/.gitignore

frontend-install:
	cd $(VISUALIZATION_DIR) && $(BUN) install --frozen-lockfile

frontend-typecheck: wasm-build
	cd $(VISUALIZATION_DIR) && $(BUN) run typecheck

frontend-build: wasm-build
	cd $(VISUALIZATION_DIR) && $(BUN) run build

frontend-test:
	cd $(VISUALIZATION_DIR) && $(BUN) run test:e2e

frontend-dev:
	cd $(VISUALIZATION_DIR) && $(BUN) run dev

frontend-preview:
	cd $(VISUALIZATION_DIR) && $(BUN) run preview

clean:
	$(CARGO) clean
	rm -rf $(VISUALIZATION_DIR)/dist
