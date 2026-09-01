import { test, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import http from "node:http";
import https from "node:https";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import selfsigned from "selfsigned";

const root = fileURLToPath(new URL("..", import.meta.url));
let backendOrigin;
let frontendOrigin;
let backend;
let backendProxy;
let frontend;
let databaseDirectory;

test.beforeAll(async ({}, testInfo) => {
  const backendPort = testInfo.project.name === "mobile-360" ? 3222 : 3224;
  const frontendPort = backendPort + 1;
  const backendInternalPort = backendPort + 20;
  const backendInternalOrigin = `http://127.0.0.1:${backendInternalPort}`;
  backendOrigin = `https://api.127.0.0.1.nip.io:${backendPort}`;
  frontendOrigin = `https://frontend.127.0.0.1.nip.io:${frontendPort}`;
  databaseDirectory = await mkdtemp(path.join(tmpdir(), "naengteol-split-origin-"));
  const certificate = await selfsigned.generate(
    [{ name: "commonName", value: "frontend.127.0.0.1.nip.io" }],
    {
      keySize: 2048,
      extensions: [{
        name: "subjectAltName",
        altNames: [
          { type: 2, value: "frontend.127.0.0.1.nip.io" },
          { type: 2, value: "api.127.0.0.1.nip.io" }
        ]
      }]
    }
  );
  backend = spawn(process.execPath, ["server.js"], {
    cwd: root,
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(backendInternalPort),
      FRONTEND_ORIGIN: frontendOrigin,
      LOCAL_DB_PATH: path.join(databaseDirectory, "app.db.json"),
      GROQ_API_KEY: "",
      SUPABASE_DB_ENABLED: "false"
    },
    stdio: ["ignore", "ignore", "inherit"]
  });
  backendProxy = https.createServer({ key: certificate.private, cert: certificate.cert }, (request, response) => {
    const proxyRequest = http.request(`${backendInternalOrigin}${request.url}`, {
      method: request.method,
      headers: { ...request.headers, host: `127.0.0.1:${backendInternalPort}`, "x-forwarded-proto": "https" }
    }, (proxyResponse) => {
      response.writeHead(proxyResponse.statusCode || 500, proxyResponse.headers);
      proxyResponse.pipe(response);
    });
    request.pipe(proxyRequest);
  });
  frontend = https.createServer({ key: certificate.private, cert: certificate.cert }, (_request, response) => {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(`<!doctype html>
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <title>split origin</title>
      <style>
        body { margin: 0; min-height: 100vh; font: 16px system-ui; color: #17324d; background: linear-gradient(135deg, #dff7ef, #dbeafe); }
        main { margin: 15vh auto; width: min(80%, 34rem); padding: 2rem; border: 3px solid #2563eb; border-radius: 1.5rem; background: #fff; box-shadow: 0 1rem 3rem #1e3a5f55; }
        strong { display: block; margin-top: 1rem; padding: 1rem; color: #fff; background: #15803d; border-radius: .75rem; }
      </style>
      <main><h1>Split-origin browser harness</h1><p>Frontend and API origins are isolated.</p><strong>Guest, session, and CSRF checks passed</strong></main>`);
  });
  await Promise.all([
    new Promise((resolve) => backendProxy.listen(backendPort, "127.0.0.1", resolve)),
    new Promise((resolve) => frontend.listen(frontendPort, "127.0.0.1", resolve))
  ]);
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      if ((await fetch(`${backendInternalOrigin}/health`)).ok) break;
    } catch {}
    if (attempt === 79) throw new Error("split-origin backend did not become ready");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
});

test.afterAll(async () => {
  if (backend) backend.kill();
  if (backendProxy) await new Promise((resolve) => backendProxy.close(resolve));
  if (frontend) await new Promise((resolve) => frontend.close(resolve));
  if (databaseDirectory) await rm(databaseDirectory, { recursive: true, force: true });
});

test("browser retains secure same-site cross-origin cookies for CSRF-protected mutations", async ({ page }, testInfo) => {
  await page.goto(frontendOrigin);

  const guestResponsePromise = page.waitForResponse((response) => response.url() === `${backendOrigin}/api/guest/session`);
  const guest = await page.evaluate(async (apiOrigin) => {
    const response = await fetch(`${apiOrigin}/api/guest/session`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: "{}"
    });
    return { status: response.status, body: await response.json() };
  }, backendOrigin);
  const guestSetCookie = (await guestResponsePromise).headers()["set-cookie"] || "";
  expect(guest.status).toBe(200);
  expect(guest.body.csrfToken).toEqual(expect.any(String));
  expect(guestSetCookie).toMatch(/SameSite=None/);
  expect(guestSetCookie).toMatch(/;\s*Secure(?:;|$)/);

  const reusedGuest = await page.evaluate(async (apiOrigin) => {
    const response = await fetch(`${apiOrigin}/api/guest/session`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: "{}"
    });
    return { status: response.status, body: await response.json() };
  }, backendOrigin);
  expect(reusedGuest.status).toBe(200);
  expect(reusedGuest.body.csrfToken).toBe(guest.body.csrfToken);

  const registrationResponsePromise = page.waitForResponse((response) => response.url() === `${backendOrigin}/api/auth/register`);
  const registration = await page.evaluate(async ({ apiOrigin, csrfToken }) => {
    const response = await fetch(`${apiOrigin}/api/auth/register`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
      body: JSON.stringify({
        email: "split-origin-browser@example.com",
        displayName: "분리 출처",
        password: "StrongPass!234",
        guestMergeIdempotencyKey: "split-origin-browser-register"
      })
    });
    return { status: response.status, body: await response.json() };
  }, { apiOrigin: backendOrigin, csrfToken: guest.body.csrfToken });
  const registrationSetCookie = (await registrationResponsePromise).headers()["set-cookie"] || "";
  expect(registration.status).toBe(201);
  expect(registration.body.authenticated).toBe(true);
  expect(registration.body.merge.status).toBe("completed");
  expect(registrationSetCookie).toMatch(/SameSite=None/);
  expect(registrationSetCookie).toMatch(/;\s*Secure(?:;|$)/);

  const pantry = await page.evaluate(async ({ apiOrigin, csrfToken }) => {
    const response = await fetch(`${apiOrigin}/api/pantry`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
      body: JSON.stringify({ stableId: "split-origin-item", name: "김치", quantity: "1통" })
    });
    return { status: response.status, body: await response.json() };
  }, { apiOrigin: backendOrigin, csrfToken: registration.body.csrfToken });
  expect(pantry.status).toBe(201);
  expect(pantry.body.item.name).toBe("김치");
  await page.locator("main").screenshot({
    path: path.join(root, "artifacts", `split-origin-browser-${testInfo.project.name}.png`)
  });
});
