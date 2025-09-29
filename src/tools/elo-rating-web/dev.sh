#!/bin/bash

# Save the original directory (project root)
PROJECT_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$(dirname "$0")"

# Build once first
echo "Initial build..."
bun build ./app.ts ./airtableClient.ts ./eloCalculator.ts ./types.ts ./cacheManager.ts --outdir ./dist --target browser

# Start watch mode in background
echo "Starting watch mode..."
bun build ./app.ts ./airtableClient.ts ./eloCalculator.ts ./types.ts ./cacheManager.ts --outdir ./dist --target browser --watch &
WATCH_PID=$!

# Start server from project root so .env is found
echo "Starting server..."
cd "$PROJECT_ROOT"
bun run src/tools/elo-rating-web/server.ts

# When server is stopped, kill the watch process
kill $WATCH_PID