import { config } from "./config.js";
import { SpanStatusCode } from "@opentelemetry/api";
import { section } from "./tracer.js";

export class BranchManager {
	#branches = new Map();

	register(name, setup) {
		if (this.#branches.has(name)) throw new Error(`Branch ${name} is already registered`);

		this.#branches.set(name, {
			setup,
			enabled: !setup,
			error: undefined,
			failures: 0,
			retryDelaySeconds: undefined,
			retryAt: undefined,
			inFlight: undefined,
			timer: undefined,
		});
	}

	isEnabled(names) {
		return names.every((name) => this.#branches.get(name)?.enabled);
	}

	getStatus(name) {
		const state = this.#branches.get(name);
		if (!state) return undefined;

		return {
			enabled: state.enabled,
			retryAt: state.retryAt,
		};
	}

	async ensure(names) {
		for (const name of names) {
			const state = this.#branches.get(name);
			if (!state) throw new Error(`Invalid branch requested: ${name}`);
			if (state.inFlight) await state.inFlight;
			if (!state.enabled) throw new Error(`Branch ${name} is disabled${state.error ? `: ${state.error}` : ""}`);
		}
	}

	setup(name) {
		const state = this.#branches.get(name);
		if (!state) return Promise.reject(new Error(`Invalid branch requested: ${name}`));
		if (!state.setup) return Promise.resolve(true);
		if (state.inFlight) return state.inFlight;
		if (state.retryAt && Date.now() < state.retryAt) return Promise.resolve(false);
		clearTimeout(state.timer);

		state.inFlight = section(`${name} setup`, async (span) => {
			try {
				await state.setup(span);

				state.enabled = true;
				state.error = undefined;
				state.failures = 0;
				state.retryDelaySeconds = undefined;
				state.retryAt = undefined;
				return true;
			} catch (error) {
				state.error = error instanceof Error ? error.message : String(error);
				state.failures++;
				if (state.retryDelaySeconds >= config.branchRetryMaxSeconds) state.enabled = false;

				state.retryDelaySeconds = Math.min(
					config.branchRetryMinSeconds * 2 ** (state.failures - 1),
					config.branchRetryMaxSeconds,
				);
				const delay = state.retryDelaySeconds * 1000;
				state.retryAt = Date.now() + delay;
				state.timer = setTimeout(() => this.setup(name), delay);
				state.timer.unref?.();

				span.setStatus({ code: SpanStatusCode.ERROR });
				span.recordException(error);
				span.addEvent(state.enabled ? "serving cached version" : "branch disabled", {
					branch: name,
					retryDelayMs: delay,
					error: state.error,
				});
				return false;
			}
		}).finally(() => (state.inFlight = undefined));

		return state.inFlight;
	}
}
