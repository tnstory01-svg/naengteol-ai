import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const configured = String(process.env.PUBLIC_API_BASE_URL || "").trim();
if (!configured) {
  throw new Error("PUBLIC_API_BASE_URL is required.");
}

let url;
try {
  url = new URL(configured);
} catch {
  throw new Error("PUBLIC_API_BASE_URL must be a valid absolute URL.");
}

if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
  throw new Error("PUBLIC_API_BASE_URL must be an https origin without credentials, path, query, or fragment.");
}

const outputPath = fileURLToPath(new URL("../public/runtime-config.js", import.meta.url));
await writeFile(outputPath, `window.NAENGTEOL_API_BASE_URL = ${JSON.stringify(url.origin)};\n`, "utf8");
console.log(`Configured Pages API origin: ${url.origin}`);
