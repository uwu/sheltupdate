import { mkdtempSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import Cache from "./cache.js";
import { config } from "./config.js";

export const cacheRoot = config.cache.root;
export const cacheScratchRoot = join(cacheRoot, "tmp");

mkdirSync(cacheRoot, { recursive: true });
rmSync(cacheScratchRoot, { recursive: true, force: true });
mkdirSync(cacheScratchRoot, { recursive: true });

export const createCacheTempDir = (prefix) => mkdtempSync(join(cacheScratchRoot, `${prefix}-`));

export const proxyCache = new Cache("proxy", join(cacheRoot, "proxy"), config.cache.proxy);
export const v1ModuleCache = new Cache("v1 modules", join(cacheRoot, "v1-modules"), config.cache.v1Modules);
export const v2ModuleCache = new Cache("v2 modules", join(cacheRoot, "v2-modules"), config.cache.v2Modules);
