Up to date as of 2025-08-25 (if a long time has passed since then, take less seriously)

# Elo Rating Web - File Structure

## Source Files (Edit These!)

These are the canonical TypeScript source files that you should edit:

```
src/elo-rating-web/
├── app.ts                 # Main application logic
├── airtableClient.ts      # Airtable API integration
├── cacheManager.ts        # Browser cache management
├── eloCalculator.ts       # Elo rating calculations
├── types.ts               # TypeScript type definitions
├── server.ts              # Bun server for local development
├── index.html             # Main HTML interface
└── tsconfig.json          # TypeScript configuration
```

## Build Output (Auto-generated - Don't Edit!)

These files are automatically generated when you run `bun run build-elo`:

```
src/elo-rating-web/dist/
├── app.js                 # Compiled from app.ts
├── airtableClient.js      # Compiled from airtableClient.ts
├── cacheManager.js        # Compiled from cacheManager.ts
├── eloCalculator.js       # Compiled from eloCalculator.ts
└── types.js               # Compiled from types.ts
```

## Documentation

```
├── README.md              # User guide
├── REVIEW.md              # Pre-push checklist and known issues
├── FILE_STRUCTURE.md      # This file
└── elo-rating-plan.md     # Original design document
```

## Important Notes

1. **Always edit the .ts files**, never the .js files
2. **Run `bun run build-elo`** after making changes to TypeScript files
3. **The dist/ directory is gitignored** - only source files are committed
4. **Use `bun run elo`** to build and start the server in one command

## Build Commands

```bash
# Build only
bun run build-elo

# Start server only
bun run serve-elo

# Build and start server
bun run elo
```

## Development Workflow

1. Edit the TypeScript files (\*.ts)
2. Run `bun run elo` to build and test
3. The server will serve the compiled files from the dist/ directory
4. Commit only the .ts source files, not the .js compiled files
