import { createHash, randomUUID } from "crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { log, logEndSection, startLogSection } from "./logging/prettyLogger.js";

const sha256 = (data) => createHash("sha256").update(data).digest("hex");

const formatBytes = (bytes) => {
	if (bytes < 1024) return `${bytes}B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KiB`;
	return `${(bytes / 1024 / 1024).toFixed(2)}MiB`;
};

const errorMessage = (error) => error?.message ?? String(error);

export default class Cache {
	constructor(name, root, budget) {
		this.name = name;
		this.root = root;
		this.dataDir = join(root, "data");
		this.tmpDir = join(root, "tmp");
		this.lowerBytes = budget.lowerBytes;
		this.upperBytes = budget.upperBytes;
		this.entries = new Map();
		this.totalBytes = 0;

		rmSync(this.root, { recursive: true, force: true });
		mkdirSync(this.dataDir, { recursive: true });
		mkdirSync(this.tmpDir, { recursive: true });
	}

	get(key) {
		if (!this.#enabled()) return undefined;

		const entry = this.entries.get(key);
		if (!entry) return undefined;

		try {
			const body = readFileSync(entry.dataPath);
			const now = Date.now();
			const oldSize = entry.size;
			entry.lastUsedAt = now;
			entry.size = body.byteLength;
			this.totalBytes += entry.size - oldSize;

			if (entry.size > this.upperBytes) {
				this.delete(
					key,
					`cached entry exceeds upper budget (${formatBytes(entry.size)} > ${formatBytes(this.upperBytes)})`,
				);
				return undefined;
			}

			this.entries.delete(key);
			this.entries.set(key, entry);
			this.evict(key, "cache read exceeded upper budget");

			return {
				body,
				size: entry.size,
				metadata: entry.metadata,
				createdAt: entry.createdAt,
				lastUsedAt: entry.lastUsedAt,
			};
		} catch (error) {
			this.delete(key, `read failed: ${errorMessage(error)}`);
			return undefined;
		}
	}

	set(key, body, metadata = {}) {
		if (!this.#enabled()) {
			this.delete(key, "cache disabled");
			return false;
		}

		const data = Buffer.isBuffer(body) ? body : Buffer.from(body);
		if (data.byteLength > this.upperBytes) {
			this.delete(
				key,
				`entry exceeds upper budget (${formatBytes(data.byteLength)} > ${formatBytes(this.upperBytes)})`,
			);
			return false;
		}

		const oldEntry = this.entries.get(key);
		this.#evictForWrite(key, data.byteLength, oldEntry);

		const now = Date.now();
		const id = sha256(key);
		const dataPath = join(this.dataDir, `${id}.bin`);
		const tmpSuffix = `${id}-${randomUUID()}`;
		const tmpDataPath = join(this.tmpDir, `${tmpSuffix}.bin`);

		writeFileSync(tmpDataPath, data);
		renameSync(tmpDataPath, dataPath);

		if (oldEntry) this.totalBytes -= oldEntry.size;

		const entry = {
			key,
			id,
			dataPath,
			size: data.byteLength,
			createdAt: oldEntry?.createdAt ?? now,
			lastUsedAt: now,
			metadata,
		};

		this.entries.set(key, entry);
		this.totalBytes += entry.size;
		this.evict(key, "cache write exceeded upper budget");

		return this.entries.has(key);
	}

	delete(key, reason = "delete requested") {
		const entry = this.entries.get(key);
		if (!entry) return;

		this.entries.delete(key);
		this.totalBytes -= entry.size;
		rmSync(entry.dataPath, { force: true });
		this.#logEviction(entry, reason);
	}

	evict(protectedKey, reason = "cache over upper budget") {
		if (this.totalBytes <= this.upperBytes) return;

		this.#evictToTarget(this.lowerBytes, new Set(protectedKey === undefined ? [] : [protectedKey]), reason);
	}

	#enabled() {
		return this.upperBytes > 0;
	}

	#evictForWrite(key, incomingBytes, oldEntry) {
		const replacedBytes = oldEntry?.size ?? 0;
		const projectedBytes = this.totalBytes - replacedBytes + incomingBytes;
		if (projectedBytes <= this.upperBytes) return;

		const targetBytes = Math.max(0, this.lowerBytes - incomingBytes + replacedBytes);
		this.#evictToTarget(targetBytes, new Set([key]), "cache write would exceed upper budget");
	}

	#evictToTarget(targetBytes, protectedKeys, reason) {
		const evictable = [...this.entries.values()].sort(
			(a, b) => a.lastUsedAt - b.lastUsedAt || a.createdAt - b.createdAt,
		);

		for (const entry of evictable) {
			if (this.totalBytes <= targetBytes) break;
			if (protectedKeys.has(entry.key) || !this.entries.has(entry.key)) continue;

			this.delete(entry.key, `${reason}; evicting LRU entries toward ${formatBytes(targetBytes)}`);
		}
	}

	#logEviction(entry, reason) {
		startLogSection(`cache:${this.name}`);
		log(
			`evicted key=${this.#formatKey(entry.key)} id=${entry.id} size=${formatBytes(entry.size)} reason=${reason}; ${this.#fullness()}`,
		);
		logEndSection();
	}

	#formatKey(key) {
		return JSON.stringify(key);
	}

	#fullness() {
		if (!this.#enabled()) {
			return `entries=${this.entries.size} size=${formatBytes(this.totalBytes)} fullness=disabled`;
		}

		const percent = ((this.totalBytes / this.upperBytes) * 100).toFixed(1);
		return `entries=${this.entries.size} size=${formatBytes(this.totalBytes)}/${formatBytes(this.upperBytes)} fullness=${percent}% lower=${formatBytes(this.lowerBytes)}`;
	}
}
