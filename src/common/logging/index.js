import { log, resetLogger, startLogSection } from "./prettyLogger.js";

// https://github.com/uwu/containerspy/blob/6dbe5b766328e76586502203eb5ec9c0582aa1ae/src/s_log.rs#L85

const SAFE_ALPHABET = `abcdefghijklmnopqrstuvxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_+.,/\\|!@#$%^&*()[]{}`;

function needsEscaping(s) {
	for (const c of s) {
		if (!SAFE_ALPHABET.includes(c)) return true;
	}

	return false;
}

// seconds, nanoseconds -> seconds
function hrTimeToS(hrTime) {
	return hrTime[0] + hrTime[1] / (1000 * 1000);
}

function stringifyAttributes(attrs) {
	return Object.entries(attrs).map(([k, v]) =>
		typeof v !== "string" || needsEscaping(v) ? `${k}=${JSON.stringify(v)}` : `${k}=${v}`,
	);
}

/**
 * @import {SpanExporter} from "@opentelemetry/sdk-trace-node"
 * */

/**
 * @implements SpanExporter
 * */
export class ShupLoggerSpanExporter {
	passthru;

	constructor(passthru) {
		this.passthru = passthru;
	}

	export(spans, resultCallback) {
		// send to otlp or whatever
		this.passthru.export(spans, resultCallback);

		// group spans into traces
		const traces = new Map();

		for (const span of spans) {
			let traceArr = traces.get(span.spanContext().traceId);

			if (!traceArr) {
				traceArr = [];
				traces.set(span.spanContext().traceId, traceArr);
			}

			traceArr.push(span);
		}

		// process each trace
		for (const traceSpans of traces.values()) {
			// build lookup map to assist in resolving parents
			const spanMap = new Map();

			for (const span of traceSpans) spanMap.set(span.spanContext().spanId, span);

			// figure out all spans in the trace
			const logsToPrint = [];

			for (const span of traceSpans) {
				const spanNames = [];

				let parent = span.parentSpanContext;
				while (parent) {
					const parentSpan = spanMap.get(parent.spanId);
					if (!parentSpan) break;

					spanNames.push(parentSpan.name);
					parent = parentSpan.parentSpanContext;
				}

				spanNames.push(span.name);

				logsToPrint.push({
					msg: `start span ts=${hrTimeToS(span.startTime)} ${stringifyAttributes(span.attributes).join(" ")}`,
					ts: hrTimeToS(span.startTime),
					spanNames,
				});

				for (const e of span.events)
					logsToPrint.push({
						msg: `${e.name} ts=${hrTimeToS(e.time)} ${stringifyAttributes(e.attributes).join(" ")}`,
						ts: hrTimeToS(e.time),
						spanNames,
					});

				const endTime = hrTimeToS(span.startTime) + hrTimeToS(span.duration);
				logsToPrint.push({
					msg: `end span ts=${endTime} dur=${hrTimeToS(span.duration)}`,
					ts: endTime,
					spanNames,
				});
			}

			// sort the logs
			logsToPrint.sort((a, b) => a.ts - b.ts);

			// print them
			for (const l of logsToPrint) {
				resetLogger();
				for (const sec of l.spanNames) startLogSection(sec);

				log(l.msg);
			}
		}
	}

	async shutdown() {
		await this.passthru.shutdown();
	}

	async forceFlush() {
		await this.passthru.forceFlush();
	}
}
