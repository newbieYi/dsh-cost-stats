window.__ModuleLoader__.load({
	id: "dsh-cost-stats",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		let react_jsx_runtime = require("react/jsx-runtime");

		//#region pricing
		/** 定价表：USD / 百万 tokens。来源：skyengine /v1/models 的 model_price 与
		 *  @deepseek-ai/dsh 内置 pi-ai providers 数据（deepseek.json / anthropic.json）。 */
		const PRICES = {
			"deepseek-v4-pro": { input: 0.42857, cacheRead: 0.00357, cacheWrite: 0, output: 0.85714 },
			"deepseek-v4-flash": { input: 0.14286, cacheRead: 0.002857, cacheWrite: 0, output: 0.28571 },
			"claude-opus-5-thinking": { input: 5.0, cacheRead: 0.5, cacheWrite: 6.25, output: 25.0 },
			"claude-opus-5": { input: 5.0, cacheRead: 0.5, cacheWrite: 6.25, output: 25.0 }
		};
		const CNY_PER_USD = 7.2;

		/** 一行（模型聚合）的估算费用，美元。未知模型返回 null。 */
		function usageCost(row) {
			const p = PRICES[row.model];
			if (p === void 0) return null;
			return (row.uncached * p.input
				+ row.cacheRead * p.cacheRead
				+ row.cacheWrite * p.cacheWrite
				+ row.output * p.output) / 1e6;
		}

		function fmtTokens(n) {
			n = n || 0;
			if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + "M";
			if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e4 ? 0 : 1) + "K";
			return String(Math.round(n));
		}
		function fmtUsd(n) {
			if (!n || n <= 0) return "$0.0000";
			if (n < 0.01) return "$" + n.toFixed(4);
			return "$" + n.toFixed(2);
		}
		function fmtCny(n) {
			return "¥" + ((n || 0) * CNY_PER_USD).toFixed(2);
		}
		//#endregion

		//#region locale
		const NS = "cost";
		const zh = {
			"view.cost": "成本统计",
			"title.total": "本会话估算费用",
			"tokens.uncachedInput": "未缓存输入",
			"tokens.cacheRead": "缓存读",
			"tokens.cacheWrite": "缓存写",
			"tokens.output": "输出",
			"tokens.cacheHitRate": "缓存命中率",
			"table.model": "模型",
			"table.cost": "费用",
			"table.total": "合计",
			"empty.title": "暂无用量",
			"empty.desc": "发送一条消息后，这里会实时显示本会话的 token 消耗与费用估算。",
			"note.priceSource": "价格：USD / 百万 tokens（skyengine / 官方公开价）；汇率 1 USD ≈ ¥7.2。费用为估算，以提供商账单为准。",
			"note.window": "按模型明细覆盖当前已加载的会话窗口。",
			"requests.title": "请求明细",
			"requests.seq": "请求",
			"requests.note": "每次请求（一次模型调用）的 token 用量与费用；序号按当前已加载的会话窗口排序。"
		};
		const en = {
			"view.cost": "Cost",
			"title.total": "Estimated cost of this conversation",
			"tokens.uncachedInput": "Uncached input",
			"tokens.cacheRead": "Cache read",
			"tokens.cacheWrite": "Cache write",
			"tokens.output": "Output",
			"tokens.cacheHitRate": "Cache hit rate",
			"table.model": "Model",
			"table.cost": "Cost",
			"table.total": "Total",
			"empty.title": "No usage yet",
			"empty.desc": "Send a message and this tab will show live token usage and cost estimates for the conversation.",
			"note.priceSource": "Prices: USD / 1M tokens (skyengine / public list prices); 1 USD ≈ ¥7.2. Estimates only — refer to your provider bill.",
			"note.window": "Per-model breakdown covers the currently loaded conversation window.",
			"requests.title": "Per-request breakdown",
			"requests.seq": "Request",
			"requests.note": "Token usage and cost per request (one model call); numbers are ordered within the loaded window."
		};
		//#endregion

		//#region conversation view (per-model token fold)
		const ZERO_TOTALS = { uncached: 0, cacheRead: 0, cacheWrite: 0, output: 0 };
		const EMPTY_COST_SNAPSHOT = { rows: [], totals: ZERO_TOTALS, requests: [] };

		/** 把 assistant/message 的 usage 归一化为四桶（inputTokens 在 DSH 里已经是未缓存输入）。 */
		function normalizeUsage(u) {
			if (!u) return null;
			return {
				uncached: u.inputTokens || 0,
				cacheRead: u.cacheReadTokens || 0,
				cacheWrite: u.cacheWriteTokens || 0,
				output: u.outputTokens || 0
			};
		}

		const requestHeaderDefinition = {
			kind: "cost-request-header",
			target: "cost",
			match: (event) => event.type === "request/header" ? { id: String(event.seq), role: "start" } : null,
			start: (_context, match) => {
				const config = match.event.data?.header?.config ?? { provider: "unknown", model: "unknown" };
				return { seq: match.event.seq, config };
			},
			update: (context) => context.state,
			buildViewNode: (context) => context.state === void 0 ? null : {
				key: context.key,
				kind: context.kind,
				id: context.id,
				target: "cost",
				anchorSeq: context.state.seq,
				data: { kind: "request-header", config: context.state.config }
			}
		};

		const assistantDefinition = {
			kind: "cost-assistant",
			target: "cost",
			match: (event) => {
				if (event.type === "step/start") return { id: `${event.data.turn}:${event.data.step}`, role: "start" };
				if (event.type === "assistant/message") return { id: `${event.data.turn}:${event.data.step}`, role: "update" };
				return null;
			},
			start: (_context, match) => {
				if (match.event.type !== "step/start") throw new Error("cost-assistant start requires step/start");
				return { turn: match.event.data.turn, step: match.event.data.step, startSeq: match.event.seq, usage: null, usageSeq: null };
			},
			update: (context, match) => {
				if (match.event.type === "assistant/message") {
					const usage = normalizeUsage(match.event.data?.usage);
					if (usage === null) return context.state;
					return { ...context.state, usage, usageSeq: match.event.seq };
				}
				return context.state;
			},
			buildViewNode: (context) => {
				const s = context.state;
				if (s === void 0 || s.usage === null) return null;
				return {
					key: context.key,
					kind: context.kind,
					id: context.id,
					target: "cost",
					anchorSeq: s.usageSeq ?? s.startSeq,
					data: { kind: "assistant", turn: s.turn, step: s.step, usage: s.usage }
				};
			}
		};

		class CostSnapshotBuilder {
			constructor() {
				this.nodes = new Map();
				this.contributions = [];
			}
			empty = EMPTY_COST_SNAPSHOT;
			replace(input) {
				this.nodes.clear();
				for (const node of input.nodes) this.nodes.set(node.key, node);
				this.rebuild();
				return this.snapshot();
			}
			apply(input) {
				for (const node of input.upserts) this.nodes.set(node.key, node);
				this.rebuild();
				return this.snapshot();
			}
			rebuild() {
				this.contributions = [...this.nodes.values()].sort((a, b) => (a.anchorSeq ?? 0) - (b.anchorSeq ?? 0));
			}
			snapshot() {
				let current = null;
				const byModel = new Map();
				const requests = [];
				const totals = { uncached: 0, cacheRead: 0, cacheWrite: 0, output: 0 };
				for (const c of this.contributions) {
					const d = c.data;
					if (d.kind === "request-header") {
						current = d.config;
						continue;
					}
					if (d.kind === "assistant" && d.usage) {
						const model = current?.model ?? "unknown";
						const provider = current?.provider ?? "unknown";
						const key = provider + "\u0000" + model;
						let row = byModel.get(key);
						if (row === void 0) {
							row = { provider, model, uncached: 0, cacheRead: 0, cacheWrite: 0, output: 0 };
							byModel.set(key, row);
						}
						row.uncached += d.usage.uncached;
						row.cacheRead += d.usage.cacheRead;
						row.cacheWrite += d.usage.cacheWrite;
						row.output += d.usage.output;
						totals.uncached += d.usage.uncached;
						totals.cacheRead += d.usage.cacheRead;
						totals.cacheWrite += d.usage.cacheWrite;
						totals.output += d.usage.output;
						requests.push({
							turn: d.turn,
							step: d.step,
							provider,
							model,
							uncached: d.usage.uncached,
							cacheRead: d.usage.cacheRead,
							cacheWrite: d.usage.cacheWrite,
							output: d.usage.output
						});
					}
				}
				return { rows: [...byModel.values()], totals, requests };
			}
		}

		const costViewDefinition = {
			target: "cost",
			create: () => new CostSnapshotBuilder()
		};
		//#endregion

		//#region component
		const styles = {
			root: {
				flex: "1 1 auto",
				minHeight: 0,
				overflowY: "auto",
				padding: "20px calc(var(--dsh-composer-side-clearance, 16px) + 16px)",
				display: "flex",
				flexDirection: "column",
				alignItems: "center"
			},
			inner: {
				width: "100%",
				maxWidth: "var(--dsh-chat-content-width, 748px)",
				display: "flex",
				flexDirection: "column",
				gap: 16
			},
			hero: {
				border: "1px solid var(--dsw-alias-border-l2, #e5e5e5)",
				background: "var(--dsw-alias-bg-layer-1, #fff)",
				borderRadius: 16,
				padding: "18px 20px",
				display: "flex",
				flexDirection: "column",
				gap: 4
			},
			heroLabel: {
				color: "var(--dsw-alias-label-tertiary, #8a8a8a)",
				fontSize: 12,
				lineHeight: "18px"
			},
			heroValue: {
				color: "var(--dsw-alias-label-primary, #1a1a1a)",
				fontSize: 26,
				fontWeight: 600,
				lineHeight: "34px",
				fontVariantNumeric: "tabular-nums"
			},
			heroCny: {
				color: "var(--dsw-alias-label-secondary, #5a5a5a)",
				fontSize: 16,
				fontWeight: 500
			},
			grid: {
				display: "grid",
				gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
				gap: 10
			},
			stat: {
				border: "1px solid var(--dsw-alias-border-l2, #e5e5e5)",
				background: "var(--dsw-alias-bg-layer-1, #fff)",
				borderRadius: 12,
				padding: "12px 14px",
				display: "flex",
				flexDirection: "column",
				gap: 2
			},
			statValue: {
				color: "var(--dsw-alias-label-primary, #1a1a1a)",
				fontSize: 18,
				fontWeight: 600,
				lineHeight: "26px",
				fontVariantNumeric: "tabular-nums"
			},
			statLabel: {
				color: "var(--dsw-alias-label-tertiary, #8a8a8a)",
				fontSize: 12,
				lineHeight: "18px"
			},
			cacheHit: {
				color: "var(--dsw-alias-label-secondary, #5a5a5a)",
				fontSize: 13,
				lineHeight: "20px",
				textAlign: "right"
			},
			table: {
				width: "100%",
				borderCollapse: "collapse",
				border: "1px solid var(--dsw-alias-border-l2, #e5e5e5)",
				background: "var(--dsw-alias-bg-layer-1, #fff)",
				borderRadius: 12,
				overflow: "hidden",
				fontSize: 13,
				lineHeight: "20px"
			},
			th: {
				textAlign: "right",
				color: "var(--dsw-alias-label-tertiary, #8a8a8a)",
				fontWeight: 500,
				padding: "10px 14px",
				borderBottom: "1px solid var(--dsw-alias-border-l2, #e5e5e5)",
				whiteSpace: "nowrap"
			},
			thFirst: {
				textAlign: "left",
				color: "var(--dsw-alias-label-tertiary, #8a8a8a)",
				fontWeight: 500,
				padding: "10px 14px",
				borderBottom: "1px solid var(--dsw-alias-border-l2, #e5e5e5)",
				whiteSpace: "nowrap"
			},
			td: {
				textAlign: "right",
				color: "var(--dsw-alias-label-primary, #1a1a1a)",
				padding: "9px 14px",
				borderBottom: "1px solid var(--dsw-alias-border-l2, #eee)",
				fontVariantNumeric: "tabular-nums"
			},
			tdFirst: {
				textAlign: "left",
				color: "var(--dsw-alias-label-primary, #1a1a1a)",
				padding: "9px 14px",
				borderBottom: "1px solid var(--dsw-alias-border-l2, #eee)",
				fontWeight: 500
			},
			tdCost: {
				textAlign: "right",
				color: "var(--dsw-alias-state-business-primary, #4d6bfe)",
				padding: "9px 14px",
				borderBottom: "1px solid var(--dsw-alias-border-l2, #eee)",
				fontWeight: 600,
				fontVariantNumeric: "tabular-nums"
			},
			empty: {
				border: "1px dashed var(--dsw-alias-border-l2, #e5e5e5)",
				borderRadius: 12,
				padding: "32px 20px",
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				gap: 6,
				textAlign: "center"
			},
			emptyTitle: {
				color: "var(--dsw-alias-label-primary, #1a1a1a)",
				fontSize: 15,
				fontWeight: 500,
				lineHeight: "24px"
			},
			emptyDesc: {
				color: "var(--dsw-alias-label-tertiary, #8a8a8a)",
				fontSize: 13,
				lineHeight: "20px",
				maxWidth: 360
			},
			note: {
				color: "var(--dsw-alias-label-tertiary, #8a8a8a)",
				fontSize: 12,
				lineHeight: "18px"
			},
			section: {
				display: "flex",
				flexDirection: "column",
				gap: 8
			},
			sectionTitle: {
				color: "var(--dsw-alias-label-primary, #1a1a1a)",
				fontSize: 15,
				fontWeight: 600,
				lineHeight: "24px"
			},
			reqSeq: {
				fontWeight: 600
			},
			reqMeta: {
				color: "var(--dsw-alias-label-tertiary, #8a8a8a)",
				fontSize: 11,
				lineHeight: "16px"
			}
		};

		function StatBox({ label, value }) {
			return react_jsx_runtime.jsxs("div", { style: styles.stat, children: [
				react_jsx_runtime.jsx("div", { style: styles.statValue, children: value }),
				react_jsx_runtime.jsx("div", { style: styles.statLabel, children: label })
			] });
		}

		function CostView({ useSession, useProjection, t }) {
			const cost = useSession((s) => s.views.get("cost") ?? EMPTY_COST_SNAPSHOT);
			const tokenUsage = useProjection("tokenUsage");

			// 按模型（窗口内）聚合费用
			const rows = (cost.rows ?? []).map((r) => ({ ...r, cost: usageCost(r) }));
			const windowCost = rows.reduce((sum, r) => sum + (r.cost ?? 0), 0);

			// 每次请求（一次模型调用）的明细，窗口内按请求顺序
			const requests = (cost.requests ?? []).map((r, i) => ({ ...r, index: i + 1, cost: usageCost(r) }));

			// 权威全日志 token 总量（优先用投影，缺省退回窗口聚合）
			const uncached = tokenUsage !== void 0 ? (tokenUsage.uncachedInputTokens ?? 0) : (cost.totals?.uncached ?? 0);
			const cacheRead = tokenUsage !== void 0 ? (tokenUsage.cacheReadTokens ?? 0) : (cost.totals?.cacheRead ?? 0);
			const cacheWrite = tokenUsage !== void 0 ? (tokenUsage.cacheWriteTokens ?? 0) : (cost.totals?.cacheWrite ?? 0);
			const output = tokenUsage !== void 0 ? (tokenUsage.outputTokens ?? 0) : (cost.totals?.output ?? 0);
			const billedInput = uncached + cacheRead + cacheWrite;
			const cacheHitRate = billedInput > 0 ? Math.round(cacheRead / billedInput * 100) : null;
			const isEmpty = rows.length === 0 && billedInput === 0 && output === 0;

			const tableHead = react_jsx_runtime.jsxs("thead", { children: [
				react_jsx_runtime.jsxs("tr", { children: [
					react_jsx_runtime.jsx("th", { style: styles.thFirst, children: t("table.model") }),
					react_jsx_runtime.jsx("th", { style: styles.th, children: t("tokens.uncachedInput") }),
					react_jsx_runtime.jsx("th", { style: styles.th, children: t("tokens.cacheRead") }),
					react_jsx_runtime.jsx("th", { style: styles.th, children: t("tokens.cacheWrite") }),
					react_jsx_runtime.jsx("th", { style: styles.th, children: t("tokens.output") }),
					react_jsx_runtime.jsx("th", { style: styles.th, children: t("table.cost") })
				] })
			] });

			const bodyRows = rows.map((r) => react_jsx_runtime.jsxs("tr", {
				key: r.provider + "\u0000" + r.model,
				children: [
					react_jsx_runtime.jsx("td", { style: styles.tdFirst, children: r.model }),
					react_jsx_runtime.jsx("td", { style: styles.td, children: fmtTokens(r.uncached) }),
					react_jsx_runtime.jsx("td", { style: styles.td, children: fmtTokens(r.cacheRead) }),
					react_jsx_runtime.jsx("td", { style: styles.td, children: fmtTokens(r.cacheWrite) }),
					react_jsx_runtime.jsx("td", { style: styles.td, children: fmtTokens(r.output) }),
					react_jsx_runtime.jsx("td", { style: styles.tdCost, children: r.cost === null ? "—" : fmtUsd(r.cost) })
				]
			}));

			const table = react_jsx_runtime.jsxs("table", { style: styles.table, children: [
				tableHead,
				react_jsx_runtime.jsx("tbody", { children: bodyRows })
			] });

			const requestsTableHead = react_jsx_runtime.jsxs("thead", { children: [
				react_jsx_runtime.jsxs("tr", { children: [
					react_jsx_runtime.jsx("th", { style: styles.thFirst, children: t("requests.seq") }),
					react_jsx_runtime.jsx("th", { style: styles.thFirst, children: t("table.model") }),
					react_jsx_runtime.jsx("th", { style: styles.th, children: t("tokens.uncachedInput") }),
					react_jsx_runtime.jsx("th", { style: styles.th, children: t("tokens.cacheRead") }),
					react_jsx_runtime.jsx("th", { style: styles.th, children: t("tokens.cacheWrite") }),
					react_jsx_runtime.jsx("th", { style: styles.th, children: t("tokens.output") }),
					react_jsx_runtime.jsx("th", { style: styles.th, children: t("table.cost") })
				] })
			] });

			const requestRows = requests.map((r) => react_jsx_runtime.jsxs("tr", {
				key: "req-" + r.turn + "-" + r.step + "-" + r.index,
				children: [
					react_jsx_runtime.jsxs("td", { style: styles.tdFirst, children: [
						react_jsx_runtime.jsx("div", { style: styles.reqSeq, children: "#" + r.index }),
						react_jsx_runtime.jsx("div", { style: styles.reqMeta, children: "T" + r.turn + " · S" + r.step })
					] }),
					react_jsx_runtime.jsx("td", { style: styles.tdFirst, children: r.model }),
					react_jsx_runtime.jsx("td", { style: styles.td, children: fmtTokens(r.uncached) }),
					react_jsx_runtime.jsx("td", { style: styles.td, children: fmtTokens(r.cacheRead) }),
					react_jsx_runtime.jsx("td", { style: styles.td, children: fmtTokens(r.cacheWrite) }),
					react_jsx_runtime.jsx("td", { style: styles.td, children: fmtTokens(r.output) }),
					react_jsx_runtime.jsx("td", { style: styles.tdCost, children: r.cost === null ? "—" : fmtUsd(r.cost) })
				]
			}));

			const requestsTable = react_jsx_runtime.jsxs("table", { style: styles.table, children: [
				requestsTableHead,
				react_jsx_runtime.jsx("tbody", { children: requestRows })
			] });

			const requestsSection = react_jsx_runtime.jsxs("div", { style: styles.section, children: [
				react_jsx_runtime.jsx("div", { style: styles.sectionTitle, children: t("requests.title") }),
				requestsTable,
				react_jsx_runtime.jsx("div", { style: styles.note, children: t("requests.note") })
			] });

			return react_jsx_runtime.jsx("div", { style: styles.root, children:
				react_jsx_runtime.jsxs("div", { style: styles.inner, children: [
					react_jsx_runtime.jsxs("div", { style: styles.hero, children: [
						react_jsx_runtime.jsx("div", { style: styles.heroLabel, children: t("title.total") }),
						react_jsx_runtime.jsxs("div", { style: styles.heroValue, children: [
							"≈ " + fmtUsd(windowCost),
							react_jsx_runtime.jsx("span", { style: styles.heroCny, children: " · " + fmtCny(windowCost) })
						] })
					] }),
					react_jsx_runtime.jsxs("div", { style: styles.grid, children: [
						react_jsx_runtime.jsx(StatBox, { label: t("tokens.uncachedInput"), value: fmtTokens(uncached) }),
						react_jsx_runtime.jsx(StatBox, { label: t("tokens.cacheRead"), value: fmtTokens(cacheRead) }),
						react_jsx_runtime.jsx(StatBox, { label: t("tokens.cacheWrite"), value: fmtTokens(cacheWrite) }),
						react_jsx_runtime.jsx(StatBox, { label: t("tokens.output"), value: fmtTokens(output) })
					] }),
					cacheHitRate === null ? null : react_jsx_runtime.jsx("div", { style: styles.cacheHit, children: t("tokens.cacheHitRate") + " " + cacheHitRate + "%" }),
					rows.length > 0 ? table : null,
					requests.length > 0 ? requestsSection : null,
					isEmpty ? react_jsx_runtime.jsxs("div", { style: styles.empty, children: [
						react_jsx_runtime.jsx("div", { style: styles.emptyTitle, children: t("empty.title") }),
						react_jsx_runtime.jsx("div", { style: styles.emptyDesc, children: t("empty.desc") })
					] }) : null,
					react_jsx_runtime.jsx("div", { style: styles.note, children: t("note.priceSource") }),
					react_jsx_runtime.jsx("div", { style: styles.note, children: t("note.window") })
				] })
			});
		}
		//#endregion

		//#region apply / inject
		const inject = ["slots", "conversationEvents", "conversationViews", "locale"];

		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "cost-stats: dictionaries");
			const t = ctx.locale.bind(NS);

			ctx.conversationEvents.register(requestHeaderDefinition);
			ctx.conversationEvents.register(assistantDefinition);
			ctx.conversationViews.register(costViewDefinition);

			ctx.slots.inject("conversation.view", () => ctx.slots.register({
				name: "conversation.view",
				id: "cost",
				order: 30,
				locale: NS,
				label: () => t("view.cost"),
				inject: () => ({})
			}, CostView));
		}
		//#endregion

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
