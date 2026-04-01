import { mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { config } from "./config.js";

export const inMemory = config.inMemory;

// FS mode: temp directory for disk-based caching
export const cacheBase = inMemory ? undefined : mkdtempSync(join(tmpdir(), "sheltupdate-cache-"));

// In-memory mode: Map for V1 module cache
export const v1ModuleCache = inMemory ? new Map() : undefined;

if (!inMemory) console.log("file system cache at ", cacheBase);
else console.log("using in-memory cache");
