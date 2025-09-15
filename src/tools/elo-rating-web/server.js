import { serve } from "bun";
import { readFileSync } from "fs";
import { join } from "path";
import dotenv from "dotenv";
// Load environment variables
dotenv.config({ path: join(process.cwd(), ".env") });
const PORT = 8000;
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
        }
        catch (e) {
            // File not found, continue
        }
        return new Response("Not found", { status: 404 });
    }
});
console.log(`Server running at http://localhost:${PORT}`);
console.log("Airtable credentials loaded from .env file");
