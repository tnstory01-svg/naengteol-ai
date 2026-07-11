import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = fileURLToPath(new URL("..", import.meta.url));
const publicDirectory = path.join(root, "public");
const port = 3218;
const origin = `http://127.0.0.1:${port}`;
let server;
let databaseDirectory;

async function request(pathname, options = {}) {
  return fetch(`${origin}${pathname}`, options);
}

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      if ((await request("/health")).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("server.js did not become ready");
}

function pngDimensions(buffer) {
  assert.deepEqual([...buffer.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(buffer.toString("ascii", 12, 16), "IHDR");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

before(async () => {
  databaseDirectory = await mkdtemp(path.join(tmpdir(), "naengteol-pwa-contract-"));
  server = spawn(process.execPath, ["server.js"], {
    cwd: root,
    env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), LOCAL_DB_PATH: path.join(databaseDirectory, "app.db.json"), GROQ_API_KEY: "", SUPABASE_DB_ENABLED: "false" },
    stdio: ["ignore", "ignore", "inherit"]
  });
  await waitForServer();
});

after(async () => {
  if (server) server.kill();
  if (databaseDirectory) await rm(databaseDirectory, { recursive: true, force: true });
});

describe("online-only PWA contract", () => {
  test("manifest declares an installable Korean standalone app and maskable icons", async () => {
    const manifest = JSON.parse(await readFile(path.join(publicDirectory, "manifest.webmanifest"), "utf8"));
    assert.equal(manifest.display, "standalone");
    assert.equal(manifest.start_url, "/");
    assert.equal(manifest.scope, "/");
    assert.match(`${manifest.name} ${manifest.short_name}`, /[가-힣]/);
    assert.ok(Array.isArray(manifest.icons));
    for (const size of [192, 512]) {
      const icon = manifest.icons.find((entry) => entry.sizes === `${size}x${size}`);
      assert.ok(icon, `missing ${size}x${size} icon`);
      assert.equal(icon.type, "image/png");
      assert.equal(icon.purpose, "maskable");
      assert.match(icon.src, /^\/?[^?#]+\.png$/);
    }
  });

  test("referenced icons are structurally valid PNGs at exact dimensions", async () => {
    const manifest = JSON.parse(await readFile(path.join(publicDirectory, "manifest.webmanifest"), "utf8"));
    for (const size of [192, 512]) {
      const icon = manifest.icons.find((entry) => entry.sizes === `${size}x${size}`);
      assert.ok(icon);
      const iconPath = path.resolve(publicDirectory, `.${icon.src.startsWith("/") ? icon.src : `/${icon.src}`}`);
      assert.ok(iconPath.startsWith(publicDirectory), "icon must remain under public directory");
      assert.deepEqual(pngDimensions(await readFile(iconPath)), { width: size, height: size });
    }
  });

  test("service worker is install/activate-only and has no offline interception", async () => {
    const source = await readFile(path.join(publicDirectory, "sw.js"), "utf8");
    assert.match(source, /addEventListener\s*\(\s*["']install["']/);
    assert.match(source, /addEventListener\s*\(\s*["']activate["']/);
    assert.doesNotMatch(source, /addEventListener\s*\(\s*["']fetch["']/);
    assert.doesNotMatch(source, /\bcaches\b|CacheStorage|\bcache\.open\s*\(/i);
  });

  test("manifest and service worker are served with deployment-safe static headers", async () => {
    const manifestResponse = await request("/manifest.webmanifest");
    assert.equal(manifestResponse.status, 200);
    assert.match(manifestResponse.headers.get("content-type") || "", /^application\/manifest\+json(?:;|$)/);
    assert.match(manifestResponse.headers.get("cache-control") || "", /public, max-age=300/);

    const workerResponse = await request("/sw.js");
    assert.equal(workerResponse.status, 200);
    assert.match(workerResponse.headers.get("content-type") || "", /^application\/javascript(?:;|$)/);
    assert.match(workerResponse.headers.get("cache-control") || "", /no-cache/);
    assert.equal((await request("/manifest.webmanifest", { method: "HEAD" })).status, 200);
    assert.equal((await request("/sw.js", { method: "HEAD" })).status, 200);
  });
});
