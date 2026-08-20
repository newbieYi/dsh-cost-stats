/** Host loader entry for the cost-statistics plugin. */
/**
 * Registers the `costStats` session projection: a whole-log fold of exact
 * provider-reported token usage multiplied by the vendored pi-ai price table
 * (lib/prices.generated.js). The browser half reads it with
 * `useProjection("costStats")` — the same push model the harness's own
 * token-meter uses — so the figures survive window paging and compaction.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { aggregateCostOverview, collectAssets, readJsonFile, readSessionEventLogs } from "./overview.js";
import { PRICES_BY_MODEL, PRICES_BY_PROVIDER } from "./prices.generated.js";

export const name = "dsh-cost-stats";
export const inject = ["sessionProjections", "webServer"];

const processToken = randomBytes(32).toString("base64url");

/** Unit price (USD / 1M tokens) for one provider route + model, or null when unknown. */
function priceFor(provider, model) {
	if (provider === "promptt" && model === "deepseek-v4-pro") {
		return { input: 0.42857, cacheRead: 0.00357, cacheWrite: 0, output: 0.85714 };
	}
	if (provider === "promptt" && model === "deepseek-v4-flash") {
		return { input: 0.1429, cacheRead: 0.002857, cacheWrite: 0, output: 0.2857 };
	}
	if (provider === "nova" && model === "claude-opus-5-thinking") {
		return { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 };
	}
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

function resolveHome() {
	const configured = process.env.DSH_HOME;
	if (typeof configured === "string" && configured.trim().length > 0) return configured.trim();
	return join(homedir(), ".dsh");
}

function authorized(request) {
	const header = request.headers.authorization;
	if (typeof header !== "string" || !header.startsWith("Bearer ")) return false;
	const presented = createHash("sha256").update(header.slice("Bearer ".length)).digest();
	const expected = createHash("sha256").update(processToken).digest();
	return timingSafeEqual(presented, expected);
}

function sendJson(response, status, body) {
	const content = Buffer.from(JSON.stringify(body));
	response.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"content-length": content.length,
		"cache-control": "no-store",
		"x-content-type-options": "nosniff"
	});
	response.end(content);
}

function parseRangeDays(request) {
	const url = new URL(request.url ?? "/", "http://localhost");
	const raw = url.searchParams.get("range") ?? "all";
	if (raw === "all") return null;
	const value = Number(raw);
	return Number.isFinite(value) && value > 0 ? Math.floor(value) : 7;
}

export function buildOverview({ rangeDays = null, now = Date.now(), dshHome = resolveHome() } = {}) {
	const storages = join(dshHome, "storages");
	const sessionCache = readJsonFile(join(storages, "session_projcache.json"), {});
	const workspaceStore = readJsonFile(join(storages, "workspace.json"), {});
	const assets = collectAssets({ workspaceStore });
	const eventLogs = readSessionEventLogs({ sessionsRoot: join(dshHome, "sessions") });
	return aggregateCostOverview({ sessionCache, workspaceStore, assets, now, rangeDays, eventLogs, priceFor });
}

function injectBootstrap(html) {
	const script = `<script>window.__DSH_COST_STATS__=${JSON.stringify({ token: processToken })};</script>`;
	if (html.includes("</head>")) return html.replace("</head>", `${script}</head>`);
	return `${script}${html}`;
}

function apply(ctx) {
	ctx.sessionProjections.register(costStatsProjection);

	ctx.effect(() => {
		const disposers = [];
		disposers.push(ctx.webServer.register({
			kind: "exact",
			path: "/cost-stats/overview",
			handler: async (request, response) => {
				if (request.method !== "GET") {
					sendJson(response, 405, { error: "method-not-allowed" });
					return;
				}
				if (!authorized(request)) {
					sendJson(response, 401, { error: "unauthorized" });
					return;
				}
				try {
					sendJson(response, 200, buildOverview({ rangeDays: parseRangeDays(request) }));
				} catch (error) {
					ctx.logger?.warn?.("cost-stats overview failed: %s", String(error?.message ?? error));
					sendJson(response, 500, { error: "internal", message: String(error?.message ?? error) });
				}
			}
		}));
		disposers.push(ctx.webServer.tapIndex(injectBootstrap));
		return () => {
			for (const dispose of disposers.reverse()) dispose();
		};
	}, "cost-stats: overview-http");
}

export { apply };
