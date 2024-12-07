import { mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

export const cacheBase = mkdtempSync(join(tmpdir(), "sheltupdate-cache-"));

console.log("file system cache at ", cacheBase);
