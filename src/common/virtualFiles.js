import { Readable } from "stream";
import archiver from "archiver";
import unzipper from "unzipper";
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
	const dir = await unzipper.Open.buffer(buffer);

	for (const entry of dir.files) {
		if (entry.type === "Directory") continue;
		const path = normalizePath(entry.path);
		files.set(path, await entry.buffer());
	}

	return files;
};

export const writeZip = async (files) => {
	const archive = archiver("zip");
	const chunks = [];

	const done = new Promise((resolve, reject) => {
		archive.on("data", (chunk) => chunks.push(chunk));
		archive.on("end", () => resolve());
		archive.on("error", reject);
	});

	for (const [path, data] of [...files.entries()].sort(([a], [b]) => a.localeCompare(b))) {
		archive.append(data, { name: path });
	}

	archive.finalize();
	await done;

	return Buffer.concat(chunks);
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
