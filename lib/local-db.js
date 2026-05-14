import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const EMPTY_DATA = {
  users: [],
  sessions: [],
  ipBlocks: [],
  pantryItems: [],
  recommendationLogs: [],
  savingsLogs: []
};

export class LocalDatabase {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = null;
    this.initialized = false;
    this.initPromise = null;
    this.writeQueue = Promise.resolve();
    this.provider = "local";
  }

  async init() {
    if (this.initialized) {
      return;
    }

    if (!this.initPromise) {
      this.initPromise = this.#load();
    }

    await this.initPromise;
  }

  async get(selector) {
    await this.writeQueue;
    await this.init();
    return clone(await selector(this.data));
  }

  async mutate(mutator) {
    const run = this.writeQueue.then(async () => {
      await this.init();
      const result = await mutator(this.data);
      await this.#write();
      return clone(result);
    });

    this.writeQueue = run.catch(() => {});
    return run;
  }

  async #load() {
    await mkdir(path.dirname(this.filePath), { recursive: true });

    if (!existsSync(this.filePath)) {
      this.data = freshData();
      await this.#write();
      this.initialized = true;
      return;
    }

    const raw = await readFile(this.filePath, "utf8");
    this.data = normalizeData(JSON.parse(raw));
    this.initialized = true;
  }

  async #write() {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(this.data, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600
    });
    await rename(tempPath, this.filePath);
  }
}

function freshData() {
  return clone(EMPTY_DATA);
}

function normalizeData(value) {
  const data = value && typeof value === "object" ? value : {};
  return {
    users: Array.isArray(data.users) ? data.users : [],
    sessions: Array.isArray(data.sessions) ? data.sessions : [],
    ipBlocks: Array.isArray(data.ipBlocks) ? data.ipBlocks : [],
    pantryItems: Array.isArray(data.pantryItems) ? data.pantryItems : [],
    recommendationLogs: Array.isArray(data.recommendationLogs) ? data.recommendationLogs : [],
    savingsLogs: Array.isArray(data.savingsLogs) ? data.savingsLogs : []
  };
}

function clone(value) {
  if (value === undefined) {
    return undefined;
  }

  return JSON.parse(JSON.stringify(value));
}
