import { serve } from "bun";
import { readFileSync } from "fs";
import { join } from "path";
import dotenv from "dotenv";
import { execSync } from "child_process";

// Load environment variables
dotenv.config({ path: join(process.cwd(), ".env") });

const PORT = 8000;

// Build the client files when server starts
const buildTime = new Date().toLocaleTimeString();
console.log(`[${buildTime}] Building client files...`);
try {
  execSync("cd src/tools/elo-rating-web && bun build ./app.ts ./airtableClient.ts ./eloCalculator.ts ./types.ts ./cacheManager.ts --outdir ./dist --target browser", {
    stdio: "inherit",
    cwd: process.cwd()
  });
  console.log(`[${buildTime}] ✅ Client files built successfully`);
} catch (error) {
  console.error(`[${buildTime}] ❌ Failed to build client files:`, error);
}

serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    
    // Serve the main HTML with injected credentials
    if (url.pathname === "/" || url.pathname === "/index.html") {
      let html = readFileSync(join(import.meta.dir, "index.html"), "utf-8");
      
      // Inject credentials as a script tag
      const credentialsScript = `
        <script>
          window.AIRTABLE_CONFIG = {
            apiKey: "${process.env.AIRTABLE_API_KEY}",
            baseId: "${process.env.AIRTABLE_BASE_ID}",
            tableName: "${process.env.AIRTABLE_TABLE_NAME}"
          };
        </script>
      `;
      
      // Insert before the closing body tag
      html = html.replace("</body>", credentialsScript + "</body>");
      
      return new Response(html, {
        headers: { "Content-Type": "text/html" }
      });
    }
    
    // Serve static files (including dist directory)
    let filePath = join(import.meta.dir, url.pathname);
    
    // Handle root files and dist files
    try {
      const file = Bun.file(filePath);
      const exists = await file.exists();
      if (exists) {
        return new Response(file);
      }
    } catch (e) {
      // File not found, continue
    }
    
    return new Response("Not found", { status: 404 });
  }
});

console.log(`[${buildTime}] 🚀 Server running at http://localhost:${PORT}`);
console.log(`[${buildTime}] 🔑 Airtable credentials loaded from .env file`);
console.log(`[${buildTime}] 👁️  Watching for changes...`);
// Trigger rebuild