import { NodeSDK } from "@opentelemetry/sdk-node";
import { context, SpanStatusCode, trace } from "@opentelemetry/api";
import { OTLPTraceExporter as OTLPGrpc } from "@opentelemetry/exporter-trace-otlp-grpc";
import { OTLPTraceExporter as OTLPJson } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPTraceExporter as OTLPProto } from "@opentelemetry/exporter-trace-otlp-proto";
import { ShupLoggerSpanExporter } from "./logging/index.js";
import { config } from "./config.js";

const exporter = new {
	protobuf: OTLPProto,
	json: OTLPJson,
	grpc: OTLPGrpc,
}[config.tracing.otlpType]({ url: config.tracing.otlpEndpoint });

const sdk = new NodeSDK({
	serviceName: config.tracing.service,
	traceExporter: config.tracing.log ? new ShupLoggerSpanExporter(exporter) : exporter,
	instrumentations: [],
});

sdk.start();

const tracer = trace.getTracer("sheltupdate-tracer");

// i will type this shit properly if we switch to TS but i just couldnt bear not having the span arg inferred omg -- ys
/**
 * @import {Span} from "@opentelemetry/api";
 * @import {Context} from "hono"
 */

/**
 * @arg {Span} span
 * @arg {Context} ctxt
 * */
export function populateReqAttrs(span, ctxt) {
	let params = ctxt.req.param();
	for (const k in params) span.setAttribute("params." + k, params[k]);

	let query = ctxt.req.query();
	for (const k in query) span.setAttribute("params." + k, query[k]);
}

/**
 * @template T
 * @arg {string} name
 * @arg {(s: Span, ...a: any[]) => T} fn
 * */
export const withSection =
	(name, fn) =>
	(...args) =>
		section(name, fn, ...args);

/**
 * @template T
 * @arg {string} name
 * @arg {(s: Span, ...a: any[]) => T} fn
 * @arg {any} args
 * @returns T
 * */
export function section(name, fn, ...args) {
	return tracer.startActiveSpan(name, (span) => {
		try {
			const res = fn(span, ...args);

			if (res instanceof Promise)
				return res.then(
					(r) => {
						span.end();
						return r;
					},
					(e) => {
						span.recordException(e);
						span.setStatus({ code: SpanStatusCode.ERROR });
						span.end();
						throw e;
					},
				);
			else {
				span.end();
				return res;
			}
		} catch (e) {
			span.recordException(e);
			span.setStatus({
				code: SpanStatusCode.ERROR,
			});
			span.end();
			throw e;
		}
	});
}
