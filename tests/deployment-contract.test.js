import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

async function withDeployment(env, run) {
  const directory = await mkdtemp(path.join(tmpdir(), "naengteol-deployment-"));
  // Import the actual Vercel entrypoint, including cold-start behavior.
  const entry = `import http from 'node:http';
    import handler from './api/index.js';
    const server = http.createServer(async (request, response) => {
      if (process.env.TEST_PARSED_BODY === 'true') {
        const chunks = [];
        for await (const chunk of request) chunks.push(chunk);
        const text = Buffer.concat(chunks).toString('utf8');
        Object.defineProperty(request, 'body', { get: () => text ? JSON.parse(text) : null });
      }
      await handler(request, response);
    });
    server.listen(0, '127.0.0.1', () => console.log(server.address().port));`;
  const child = spawn(process.execPath, ["--input-type=module", "-e", entry], {
    cwd: root,
    env: {
      ...process.env, NODE_ENV: "production", VERCEL: "1",
      SUPABASE_DB_ENABLED: "false", SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "",
      GROQ_API_KEY: "", GROQ_MODEL: "", ADMIN_EMAIL: "", ADMIN_PASSWORD: "",
      FRONTEND_ORIGIN: "https://frontend.example", SESSION_COOKIE_SECURE: "true",
      LOCAL_DB_PATH: path.join(directory, "app.db.json"), ...env
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let logs = "";
  child.stderr.on("data", (chunk) => { logs += chunk; });
  try {
    const port = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("entrypoint startup timed out")), 5000);
      child.once("error", (error) => { clearTimeout(timer); reject(error); });
      child.once("exit", () => { clearTimeout(timer); reject(new Error("entrypoint exited before listening")); });
      child.stdout.once("data", (chunk) => { clearTimeout(timer); resolve(Number(String(chunk).trim())); });
    });
    await run({ origin: `http://127.0.0.1:${port}`, directory, logs: () => logs });
  } finally {
    const exited = once(child, "exit");
    if (child.exitCode === null && child.signalCode === null) { child.kill(); await exited; }
    await rm(directory, { recursive: true, force: true });
  }
}

for (const env of [{}, { NODE_ENV: "development", VERCEL: "1" }, { VERCEL: "", SUPABASE_DB_ENABLED: "true" }]) {
  test(`deployed runtime rejects local DB without crashing: ${JSON.stringify(env)}`, async () => {
    await withDeployment(env, async ({ origin, directory }) => {
      assert.equal((await fetch(`${origin}/`)).status, 200);
      assert.equal((await fetch(`${origin}/runtime-config.js`)).status, 200);
      for (const route of ["/health", "/api/auth/session"]) {
        const response = await fetch(`${origin}${route}`);
        const body = await response.json();
        assert.equal(response.status, 503);
        assert.equal(body.details.code, "DATABASE_CONFIGURATION_REQUIRED");
        assert.equal(body.details.path, route);
        assert.equal(body.details.retryable, false);
        assert.match(body.details.requestId, /^[0-9a-f-]{36}$/);
        assert.doesNotMatch(JSON.stringify(body), /service_role|app\.db\.json/);
      }
      const preflight = await fetch(`${origin}/api/guest/session`, {
        method: "OPTIONS", headers: { origin: "https://frontend.example", "access-control-request-method": "POST" }
      });
      assert.equal(preflight.status, 204);
      assert.equal((await fetch(`${origin}/health`, { headers: { origin: "https://untrusted.example" } })).status, 403);
      assert.deepEqual(await readdir(directory), []);
    });
  });
}

test("Supabase outage yields safe diagnostics and recovers without local fallback", async () => {
  let healthy = false;
  let reads = 0;
  const upstreamSecret = "upstream-secret-must-not-appear";
  const database = http.createServer((request, response) => {
    assert.equal(request.url, "/rest/v1/app_users?select=id&limit=1");
    reads += 1;
    response.writeHead(healthy ? 200 : 401, { "content-type": "application/json" });
    response.end(healthy ? "[]" : JSON.stringify({ message: upstreamSecret }));
  });
  database.listen(0, "127.0.0.1");
  await once(database, "listening");
  try {
    await withDeployment({ SUPABASE_DB_ENABLED: "true", SUPABASE_URL: `http://127.0.0.1:${database.address().port}`, SUPABASE_SERVICE_ROLE_KEY: upstreamSecret }, async ({ origin, directory, logs }) => {
      const failed = await fetch(`${origin}/health`);
      const body = await failed.json();
      assert.equal(failed.status, 503);
      assert.equal(body.details.code, "DATABASE_UNAVAILABLE");
      assert.equal(body.details.retryable, false);
      assert.equal(JSON.stringify(body).includes(upstreamSecret), false);
      healthy = true;
      const recovered = await fetch(`${origin}/health`);
      const health = await recovered.json();
      assert.equal(recovered.status, 200);
      assert.equal(health.supabaseDatabaseConfigured, true);
      assert.equal(health.localDbConfigured, false);
      assert.equal(health.groqConfigured, false);
      assert.equal(health.aiProvider, "fallback");
      assert.equal(reads, 2);
      assert.equal(logs().includes(upstreamSecret), false);
      assert.deepEqual(await readdir(directory), []);
    });
  } finally {
    database.closeAllConnections();
    await new Promise((resolve) => database.close(resolve));
  }
});

test("local initialization failure returns 503 and can recover on the next request", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "naengteol-db-recovery-"));
  const file = path.join(directory, "app.db.json");
  await writeFile(file, "invalid JSON");
  try {
    await withDeployment({ NODE_ENV: "test", VERCEL: "", LOCAL_DB_PATH: file }, async ({ origin }) => {
      assert.equal((await fetch(`${origin}/`)).status, 200);
      const failed = await fetch(`${origin}/health`);
      assert.equal(failed.status, 503);
      assert.equal((await failed.json()).details.code, "DATABASE_INITIALIZATION_FAILED");
      await writeFile(file, "{}");
      const recovered = await fetch(`${origin}/health`);
      assert.equal(recovered.status, 200);
      assert.equal((await recovered.json()).localDbConfigured, true);
    });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("Vercel parsed bodies support mutations and preserve size and JSON validation", async () => {
  await withDeployment({ NODE_ENV: "test", VERCEL: "", TEST_PARSED_BODY: "true" }, async ({ origin }) => {
    const guestResponse = await fetch(`${origin}/api/guest/session`, { method: "POST" });
    const guest = await guestResponse.json();
    const cookie = guestResponse.headers.get("set-cookie").split(";")[0];
    const headers = { cookie, "x-csrf-token": guest.csrfToken, "content-type": "application/json" };
    const created = await fetch(`${origin}/api/pantry`, {
      method: "POST", headers, body: JSON.stringify({ name: "계란🥚", quantity: "2개" })
    });
    assert.equal(created.status, 201);
    assert.equal((await created.json()).item.name, "계란🥚");
    const invalid = await fetch(`${origin}/api/pantry`, { method: "POST", headers, body: "{" });
    assert.equal(invalid.status, 400);
    const large = await fetch(`${origin}/api/pantry`, { method: "POST", headers, body: JSON.stringify({ name: "계".repeat(6000) }) });
    assert.equal(large.status, 413);
    const listed = await fetch(`${origin}/api/pantry`, { headers: { cookie } });
    assert.equal((await listed.json()).items.length, 1);
  });
});
