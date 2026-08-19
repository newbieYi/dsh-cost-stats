/** Host loader entry for the browser-only cost-statistics plugin. */
/**
 * Registers the `costStats` session projection: a whole-log fold of exact
 * provider-reported token usage multiplied by the vendored pi-ai price table
 * (lib/prices.generated.js). The browser half reads it with
 * `useProjection("costStats")` — the same push model the harness's own
 * token-meter uses — so the figures survive window paging and compaction.
 */
import { PRICES_BY_MODEL, PRICES_BY_PROVIDER } from "./prices.generated.js";

/** Unit price (USD / 1M tokens) for one provider route + model, or null when unknown. */
function priceFor(provider, model) {
	const byProvider = PRICES_BY_PROVIDER[provider];
	const exact = byProvider !== void 0 ? byProvider[model] : void 0;
	if (exact !== void 0) return exact;
	return PRICES_BY_MODEL[model] ?? null;
}

const zeroBuckets = () => ({ uncached: 0, cacheRead: 0, cacheWrite: 0, output: 0 });

const costStatsProjection = {
	key: "costStats",
	schema: { parse: (value) => value },
	init: () => ({ current: null, rows: {}, totals: zeroBuckets() }),
	apply(state, event) {
		if (event.type === "request/header") {
			const config = event.data?.header?.config;
			const current = config !== void 0 && config !== null
				? { provider: typeof config.provider === "string" ? config.provider : "unknown", model: typeof config.model === "string" ? config.model : "unknown" }
				: null;
			if (current === null && state.current === null) return state;
			if (current !== null && state.current !== null && current.provider === state.current.provider && current.model === state.current.model) return state;
			return { ...state, current };
		}
		if (event.type === "assistant/message") {
			const usage = event.data?.usage;
			if (usage === void 0 || usage === null) return state;
			const provider = state.current?.provider ?? "unknown";
			const model = state.current?.model ?? "unknown";
			const price = priceFor(provider, model);
			const uncached = usage.inputTokens ?? 0;
			const cacheRead = usage.cacheReadTokens ?? 0;
			const cacheWrite = usage.cacheWriteTokens ?? 0;
			const output = usage.outputTokens ?? 0;
			const cost = price === null ? null
				: (uncached * price.input + cacheRead * price.cacheRead + cacheWrite * price.cacheWrite + output * price.output) / 1e6;
			const key = provider + "\u0000" + model;
			const prev = state.rows[key];
			return {
				...state,
				rows: {
					...state.rows,
					[key]: {
						provider,
						model,
						uncached: (prev?.uncached ?? 0) + uncached,
						cacheRead: (prev?.cacheRead ?? 0) + cacheRead,
						cacheWrite: (prev?.cacheWrite ?? 0) + cacheWrite,
						output: (prev?.output ?? 0) + output,
						cost: price === null ? null : ((prev?.cost ?? 0) + cost),
						price
					}
				},
				totals: {
					uncached: state.totals.uncached + uncached,
					cacheRead: state.totals.cacheRead + cacheRead,
					cacheWrite: state.totals.cacheWrite + cacheWrite,
					output: state.totals.output + output
				}
			};
		}
		return state;
	},
	view(state) {
		return { rows: Object.values(state.rows), totals: state.totals };
	},
	stateVersion: 1
};

function apply(ctx) {
	ctx.inject(["sessionProjections"], (projectionCtx) => {
		projectionCtx.sessionProjections.register(costStatsProjection);
	});
}

export { apply };
