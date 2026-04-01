import { Readable } from "stream";
import { ZipReader, ZipWriter, Uint8ArrayReader, Uint8ArrayWriter } from "@zip.js/zip.js";
import tarStream from "tar-stream";

// A virtual file tree is a Map<string, Buffer> where keys are posix-style relative paths.

const normalizePath = (p) => p.replace(/\\/g, "/").replace(/^\.\//, "");

export const streamToBuffer = async (stream) => {
	const chunks = [];
	return await new Promise((resolve, reject) => {
		stream.on("data", (chunk) => chunks.push(chunk));
		stream.on("error", reject);
		stream.on("end", () => resolve(Buffer.concat(chunks)));
	});
};

export const readZip = async (buffer) => {
	const files = new Map();
	const reader = new ZipReader(new Uint8ArrayReader(new Uint8Array(buffer)));
	const entries = await reader.getEntries();

	for (const entry of entries) {
		if (entry.directory) continue;
		const path = normalizePath(entry.filename);
		const data = await entry.getData(new Uint8ArrayWriter());
		files.set(path, Buffer.from(data));
	}

	await reader.close();
	return files;
};

export const writeZip = async (files) => {
	const writer = new ZipWriter(new Uint8ArrayWriter());

	for (const [path, data] of [...files.entries()].sort(([a], [b]) => a.localeCompare(b))) {
		await writer.add(path, new Uint8ArrayReader(new Uint8Array(data)));
	}

	const result = await writer.close();
	return Buffer.from(result);
};

export const readTar = async (buffer) => {
	const files = new Map();
	const extract = tarStream.extract();

	const done = new Promise((resolve, reject) => {
		extract.on("entry", (header, stream, next) => {
			if (header.type !== "file") {
				stream.resume();
				next();
				return;
			}
			const chunks = [];
			stream.on("data", (chunk) => chunks.push(chunk));
			stream.on("end", () => {
				files.set(normalizePath(header.name), Buffer.concat(chunks));
				next();
			});
			stream.on("error", reject);
		});
		extract.on("finish", resolve);
		extract.on("error", reject);
	});

	Readable.from(buffer).pipe(extract);
	await done;

	return files;
};

export const writeTar = async (files) => {
	const pack = tarStream.pack();
	const chunks = [];

	const done = new Promise((resolve, reject) => {
		pack.on("data", (chunk) => chunks.push(chunk));
		pack.on("end", () => resolve());
		pack.on("error", reject);
	});

	for (const [path, data] of [...files.entries()].sort(([a], [b]) => a.localeCompare(b))) {
		pack.entry({ name: path }, data);
	}

	pack.finalize();
	await done;

	return Buffer.concat(chunks);
};

export const overlayFiles = (base, extra) => {
	for (const [path, data] of extra) {
		base.set(path, data);
	}
};

export const setText = (files, path, text) => {
	files.set(normalizePath(path), Buffer.from(text));
};
