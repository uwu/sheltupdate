let indent = "";
let sections = [];
let cols = [];

// we could derive the colour with math but that causes collisions and stuff :(
let sectionCols = new Map();
let lastCol = -1;

export function log(...stuff) {
	if (sections.length)
		console.log(`${indent}[\x1B[${cols.at(-1)}m${sections.at(-1)}\x1B[39m]`, ...stuff);
	else
		console.log(indent, ...stuff);
}

export function resetLogger() {
	indent = "";
	sections = [];
	cols = [];
}

export function startLogSection(name) {
	if (sections.length) indent += "   ";
	sections.push(name);

	const ccol = sectionCols.get(name);
	if (ccol) cols.push(31 + ccol);
	else {
		lastCol = (++lastCol) % 6;
		cols.push(31 + lastCol);
		sectionCols.set(name, lastCol);
	}
}

export function logEndSection() {
	sections.pop();
	cols.pop();
	indent = indent.slice(4);
}

export const withLogSection = (name, fn) => (...args) => logSection(name, fn, ...args);

export function logSection(name, fn, ...args) {
	startLogSection(name);
	try {
		const res = fn(...args);

		if (res instanceof Promise) {
			return res.then(r => r, e => {
				logEndSection();
				throw e;
			});
		}

		logEndSection();
		return res;
	}
	catch (e)
	{
		logEndSection();
		throw e;
	}
}