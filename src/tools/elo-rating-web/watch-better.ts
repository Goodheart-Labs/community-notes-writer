#!/usr/bin/env bun

import { spawn } from "child_process";
import { watch } from "fs/promises";
import { join } from "path";

const watchDir = join(import.meta.dir);
console.log(`👁️  Watching for changes in ${watchDir}`);

let serverProcess: any = null;

async function startServer() {
  // Kill existing server if running
  if (serverProcess) {
    console.log("🔄 Restarting server...");
    serverProcess.kill();
    // Wait a bit for the process to die
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  const buildTime = new Date().toLocaleTimeString();
  console.log(`[${buildTime}] 🔨 Building and starting server...`);

  // Start new server process
  serverProcess = spawn("bun", ["run", "src/tools/elo-rating-web/server.ts"], {
    cwd: process.cwd(),
    stdio: "inherit"
  });

  serverProcess.on("error", (err: any) => {
    console.error("❌ Failed to start server:", err);
  });
}

// Use an async iterator to watch for changes
async function watchFiles() {
  try {
    const watcher = watch(watchDir, { recursive: true });

    for await (const event of watcher) {
      const filename = event.filename;

      if (!filename) continue;

      // Ignore certain files/folders
      if (filename.includes("dist/") ||
          filename.includes(".DS_Store") ||
          filename.includes("watch") ||
          filename.includes(".tmp.")) {
        continue;
      }

      // Only watch TypeScript and HTML files
      if (filename.endsWith('.ts') || filename.endsWith('.html')) {
        console.log(`📝 File changed: ${filename}`);
        await startServer();
      }
    }
  } catch (err) {
    console.error("Watch error:", err);
  }
}

// Start server initially
await startServer();

// Start watching
watchFiles();

// Handle process termination
process.on("SIGINT", () => {
  console.log("\n👋 Shutting down...");
  if (serverProcess) {
    serverProcess.kill();
  }
  process.exit(0);
});