import { watch } from "fs";
import { spawn } from "child_process";
import { join } from "path";

const watchDir = join(import.meta.dir);
console.log(`👁️  Watching for changes in ${watchDir}`);

let serverProcess: any = null;
let isRestarting = false;

function startServer() {
  if (isRestarting) return;
  isRestarting = true;

  // Kill existing server if running
  if (serverProcess) {
    console.log("🔄 Stopping server...");
    serverProcess.kill();
  }

  const buildTime = new Date().toLocaleTimeString();
  console.log(`[${buildTime}] 🔨 Building and starting server...`);

  // Start new server process
  serverProcess = spawn("bun", ["run", "src/tools/elo-rating-web/server.ts"], {
    cwd: process.cwd(),
    stdio: "inherit"
  });

  serverProcess.on("spawn", () => {
    isRestarting = false;
  });

  serverProcess.on("error", (err: any) => {
    console.error("❌ Failed to start server:", err);
    isRestarting = false;
  });

  serverProcess.on("exit", (code: number) => {
    if (code && !isRestarting) {
      console.log(`Server exited with code ${code}`);
    }
  });
}

// Debounce to avoid multiple restarts
let debounceTimer: any = null;
function handleFileChange(filename: string) {
  if (!filename) return;

  // Ignore dist folder, watch script itself, and non-relevant files
  if (filename.includes("dist/") ||
      filename.includes(".DS_Store") ||
      filename === "watch.ts") {
    return;
  }

  console.log(`📝 File changed: ${filename}`);

  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    startServer();
  }, 300); // Increased debounce time
}

// Watch for changes
watch(watchDir, { recursive: true }, (eventType, filename) => {
  if (filename) {
    handleFileChange(filename.toString());
  }
});

// Start server initially
startServer();

// Handle process termination
process.on("SIGINT", () => {
  console.log("\n👋 Shutting down...");
  if (serverProcess) {
    serverProcess.kill();
  }
  process.exit(0);
});