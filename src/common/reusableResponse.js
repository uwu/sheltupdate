// I'm sick and tired of resp body reuse issues
export default class ReusableResponse {

	#body;

	get body() {
		// this method does not exist in chrome and safari
		// but it DOES exist in both node and deno :) yay
		return ReadableStream.from(new Uint8Array(this.#body));
	}

	get bodyUsed() {
		return false
	}

	headers;
	ok;
	redirected;
	status;
	statusText;
	type;
	url;

	static async create(resp) {
		if (resp.bodyUsed)
			throw new Error("cannot turn a used response into a reusable one");

		return new ReusableResponse(resp, await resp.arrayBuffer());
	}

	constructor(resp, bodyBuf) {
		this.#body = bodyBuf;
		// these are actually stored on a symbol n stuff, annoying
		//Object.assign(this, resp);
		this.ok = resp.ok;
		this.redirected = resp.redirected;
		this.status = resp.status;
		this.statusText = resp.statusText;
		this.type = resp.type;
		this.url = resp.url;
		this.headers = new Headers(resp.headers); // clone as resp may be immutable
	}

	arrayBuffer() {
		return Promise.resolve(this.#body);
	}

	blob() {
		return Promise.resolve(new Blob(this.#body));
	}

	bytes() {
		return Promise.resolve(new Uint8Array(this.#body));
	}

	clone() {
		return new ReusableResponse(this, this.#body);
	}

	formData() {
		// bwehhhhh
		return new Response(this.#body, this).formData();
	}

	json() {
		return this.text().then(JSON.parse);
	}

	text() {
		return Promise.resolve(new TextDecoder().decode(this.#body))
	}

	toRealRes() {
		return new Response(this.#body, {...this});
	}
}