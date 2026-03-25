# Terminal Commander

# Start the app
start:
    bun start

# Start with file watching
dev:
    bun run dev

# Run tests
test:
    bun test src/

# Run smoke test
test-smoke:
    bash scripts/smoke-test.sh

# Start with inspector enabled (for E2E testing)
inspect:
    TC_INSPECTOR_PORT=9274 bun start

# Run E2E tests (auto start/stop app)
test-e2e:
    bash scripts/e2e-test.sh

# Build the app bundle
build:
    ./node_modules/.bin/electrobun build

# Install to /Applications
install: build
    @rm -rf "/Applications/Terminal Commander.app"
    cp -R "build/dev-macos-arm64/Terminal Commander-dev.app" "/Applications/Terminal Commander.app"
    @echo "Installed to /Applications/Terminal Commander.app"
