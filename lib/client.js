window.__ModuleLoader__.load({
	id: "dsh-cost-stats",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");

		//#region pricing
		/** 参考汇率：仅用于 CNY 展示换算，实际以提供商账单币种为准。 */
		const CNY_PER_USD = 7.2;

		function fmtTokens(n) {
			n = n || 0;
			if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + "M";
			if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e4 ? 0 : 1) + "K";
			return String(Math.round(n));
		}
		function fmtUsd(n) {
			if (n === null || n === void 0 || n <= 0) return "$0.0000";
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
			"note.priceSource": "价格：DSH 内置 pi-ai 官方价目表（USD / 百万 tokens），随 DSH 升级更新；CNY 为参考汇率 7.2 换算。费用为估算，以提供商账单为准。",
			"note.window": "按模型明细覆盖整个会话（含已压缩历史）；请求明细按当前已加载窗口。",
			"requests.title": "请求明细",
			"requests.seq": "请求",
			"requests.note": "每次请求（一次模型调用）的 token 用量与费用；序号按当前已加载的会话窗口排序。",
			"analysis.nav": "成本分析",
			"analysis.title": "成本分析",
			"analysis.desc": "查看模型维度与资产维度的成本统计，帮助你了解资源使用情况。",
			"analysis.modelTab": "模型维度",
			"analysis.assetTab": "资产维度",
			"analysis.rangeAll": "全部",
			"analysis.range7": "近 7 天",
			"analysis.range30": "近 30 天",
			"analysis.totalCost": "总成本 (USD)",
			"analysis.requests": "总请求数",
			"analysis.inputTokens": "总输入 Tokens",
			"analysis.outputTokens": "总输出 Tokens",
			"analysis.modelDist": "成本分布（按模型）",
			"analysis.assetDist": "成本分布（按资产）",
			"analysis.costShare": "成本占比",
			"analysis.asset": "资产",
			"analysis.type": "类型",
			"analysis.path": "路径",
			"analysis.sessions": "会话数",
			"analysis.loading": "正在读取成本分析…",
			"analysis.error": "成本分析加载失败，请稍后重试。",
			"analysis.empty": "暂无全局成本数据。安装插件后，新产生的会话用量会逐步沉淀到这里。"
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
			"note.priceSource": "Prices: DSH's built-in pi-ai list prices (USD / 1M tokens), updated with DSH; CNY is converted at a reference rate of 7.2. Estimates only — refer to your provider bill.",
			"note.window": "Per-model breakdown covers the whole conversation (including compacted history); per-request rows cover the loaded window.",
			"requests.title": "Per-request breakdown",
			"requests.seq": "Request",
			"requests.note": "Token usage and cost per request (one model call); numbers are ordered within the loaded window.",
			"analysis.nav": "Cost analysis",
			"analysis.title": "Cost analysis",
			"analysis.desc": "Review cost statistics by model and asset to understand resource usage.",
			"analysis.modelTab": "Models",
			"analysis.assetTab": "Assets",
			"analysis.rangeAll": "All",
			"analysis.range7": "Last 7 days",
			"analysis.range30": "Last 30 days",
			"analysis.totalCost": "Total cost (USD)",
			"analysis.requests": "Requests",
			"analysis.inputTokens": "Input tokens",
			"analysis.outputTokens": "Output tokens",
			"analysis.modelDist": "Cost distribution by model",
			"analysis.assetDist": "Cost distribution by asset",
			"analysis.costShare": "Cost share",
			"analysis.asset": "Asset",
			"analysis.type": "Type",
			"analysis.path": "Path",
			"analysis.sessions": "Sessions",
			"analysis.loading": "Loading cost analysis…",
			"analysis.error": "Failed to load cost analysis. Please try again.",
			"analysis.empty": "No global cost data yet. New usage will appear here after the plugin is installed."
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

		const analysisStyles = {
			root: {
				width: "100%",
				maxWidth: 760,
				display: "flex",
				flexDirection: "column",
				gap: 16,
				color: "var(--dsw-alias-label-primary, #1a1a1a)",
				paddingBottom: 24
			},
			header: { display: "flex", flexDirection: "column", gap: 6 },
			title: { margin: 0, fontSize: 17, fontWeight: 600, lineHeight: "25px" },
			desc: { margin: 0, color: "var(--dsw-alias-label-tertiary, #8a8a8a)", fontSize: 13, lineHeight: "20px" },
			controls: { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" },
			seg: {
				display: "inline-grid",
				gridTemplateColumns: "repeat(2, minmax(96px, 1fr))",
				border: "1px solid var(--dsw-alias-border-l2, #e5e5e5)",
				borderRadius: 8,
				overflow: "hidden",
				background: "var(--dsw-alias-bg-layer-1, #fff)"
			},
			segButton: {
				border: 0,
				background: "transparent",
				color: "var(--dsw-alias-label-secondary, #5a5a5a)",
				padding: "7px 14px",
				font: "inherit",
				fontSize: 13,
				cursor: "pointer"
			},
			segButtonActive: {
				background: "color-mix(in srgb, var(--dsw-alias-brand-primary, #4d6bfe) 12%, transparent)",
				color: "var(--dsw-alias-brand-primary, #4d6bfe)",
				fontWeight: 600
			},
			rangeSeg: {
				display: "inline-grid",
				gridTemplateColumns: "repeat(3, minmax(58px, 1fr))",
				border: "1px solid var(--dsw-alias-border-l2, #e5e5e5)",
				borderRadius: 8,
				overflow: "hidden",
				background: "var(--dsw-alias-bg-layer-1, #fff)",
				boxShadow: "0 1px 2px color-mix(in srgb, #000 4%, transparent)"
			},
			rangeButton: {
				border: 0,
				borderRight: "1px solid var(--dsw-alias-border-l2, #e5e5e5)",
				background: "transparent",
				color: "var(--dsw-alias-label-secondary, #5a5a5a)",
				padding: "7px 11px",
				font: "inherit",
				fontSize: 12,
				lineHeight: "18px",
				cursor: "pointer",
				whiteSpace: "nowrap"
			},
			rangeButtonActive: {
				background: "color-mix(in srgb, var(--dsw-alias-brand-primary, #4d6bfe) 10%, transparent)",
				color: "var(--dsw-alias-brand-primary, #4d6bfe)",
				fontWeight: 600
			},
			select: {
				height: 36,
				border: "1px solid var(--dsw-alias-border-l2, #e5e5e5)",
				borderRadius: 8,
				background: "var(--dsw-alias-bg-layer-1, #fff)",
				color: "var(--dsw-alias-label-primary, #1a1a1a)",
				padding: "0 12px",
				font: "inherit",
				fontSize: 13
			},
			kpis: {
				display: "grid",
				gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
				border: "1px solid var(--dsw-alias-border-l2, #e5e5e5)",
				borderRadius: 10,
				background: "var(--dsw-alias-bg-layer-1, #fff)",
				overflow: "hidden"
			},
			kpi: {
				padding: "12px 14px",
				borderRight: "1px solid var(--dsw-alias-border-l2, #e5e5e5)",
				minWidth: 0
			},
			kpiLabel: { color: "var(--dsw-alias-label-tertiary, #8a8a8a)", fontSize: 12, lineHeight: "18px" },
			kpiValue: { marginTop: 6, fontSize: 19, fontWeight: 600, lineHeight: "28px", fontVariantNumeric: "tabular-nums" },
			section: { display: "flex", flexDirection: "column", gap: 10 },
			sectionHead: { display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" },
			sectionTitle: { fontSize: 15, fontWeight: 600, lineHeight: "24px" },
			tableWrap: {
				border: "1px solid var(--dsw-alias-border-l2, #e5e5e5)",
				borderRadius: 10,
				overflow: "hidden",
				background: "var(--dsw-alias-bg-layer-1, #fff)"
			},
			listWrap: {
				border: "1px solid var(--dsw-alias-border-l2, #e5e5e5)",
				borderRadius: 10,
				overflow: "hidden",
				background: "var(--dsw-alias-bg-layer-1, #fff)"
			},
			listRow: {
				display: "flex",
				flexDirection: "column",
				gap: 12,
				padding: "14px 18px",
				borderBottom: "1px solid var(--dsw-alias-border-l2, #eee)"
			},
			listTop: {
				display: "flex",
				flexWrap: "wrap",
				gap: 18,
				alignItems: "center",
				justifyContent: "space-between",
				minWidth: 0
			},
			itemName: {
				color: "var(--dsw-alias-label-primary, #1a1a1a)",
				fontSize: 14,
				fontWeight: 600,
				lineHeight: "22px",
				overflowWrap: "anywhere"
			},
			itemMeta: {
				marginTop: 3,
				color: "var(--dsw-alias-label-tertiary, #8a8a8a)",
				fontSize: 11,
				lineHeight: "16px",
				overflowWrap: "anywhere"
			},
			itemBlock: {
				flex: "1 1 220px",
				minWidth: 0
			},
			shareBlock: {
				display: "flex",
				flexDirection: "column",
				gap: 7,
				flex: "1 1 180px",
				maxWidth: 260,
				minWidth: 0
			},
			shareText: {
				color: "var(--dsw-alias-label-secondary, #5a5a5a)",
				fontSize: 12,
				lineHeight: "18px",
				fontVariantNumeric: "tabular-nums"
			},
			barTrackWide: {
				width: "100%",
				height: 6,
				borderRadius: 999,
				background: "var(--dsw-alias-bg-module-platform, #eef0f6)",
				overflow: "hidden"
			},
			metricGrid: {
				display: "grid",
				gridTemplateColumns: "repeat(auto-fit, minmax(104px, 1fr))",
				gap: 8,
				minWidth: 0
			},
			metric: {
				minWidth: 0,
				padding: "6px 8px",
				borderRadius: 8,
				background: "var(--dsw-alias-bg-module-platform, #f6f7fb)"
			},
			metricValue: {
				color: "var(--dsw-alias-label-primary, #1a1a1a)",
				fontSize: 13,
				fontWeight: 600,
				lineHeight: "18px",
				fontVariantNumeric: "tabular-nums",
				overflowWrap: "anywhere"
			},
			metricCost: {
				color: "var(--dsw-alias-brand-primary, #4d6bfe)"
			},
			metricLabel: {
				marginTop: 1,
				color: "var(--dsw-alias-label-tertiary, #8a8a8a)",
				fontSize: 10,
				lineHeight: "14px"
			},
			barTrack: {
				width: 68,
				height: 4,
				borderRadius: 999,
				background: "var(--dsw-alias-bg-module-platform, #eef0f6)",
				overflow: "hidden"
			},
			barFill: {
				height: "100%",
				borderRadius: 999,
				background: "var(--dsw-alias-brand-primary, #4d6bfe)"
			},
			status: {
				border: "1px dashed var(--dsw-alias-border-l2, #e5e5e5)",
				borderRadius: 10,
				padding: 24,
				textAlign: "center",
				color: "var(--dsw-alias-label-tertiary, #8a8a8a)",
				fontSize: 13,
				lineHeight: "20px"
			},
			path: {
				display: "block",
				maxWidth: 300,
				overflow: "hidden",
				textOverflow: "ellipsis",
				whiteSpace: "nowrap",
				color: "var(--dsw-alias-label-tertiary, #8a8a8a)",
				fontSize: 11,
				lineHeight: "16px"
			}
		};

		function tokenTotal(tokens) {
			return (tokens?.uncached ?? 0) + (tokens?.cacheRead ?? 0) + (tokens?.cacheWrite ?? 0);
		}

		function getCostToken() {
			return typeof window !== "undefined" ? window.__DSH_COST_STATS__?.token ?? "" : "";
		}

		async function fetchOverview(range) {
			const token = getCostToken();
			const response = await fetch("/cost-stats/overview?range=" + encodeURIComponent(range), {
				headers: { authorization: "Bearer " + token }
			});
			if (!response.ok) throw new Error("overview request failed: " + response.status);
			return await response.json();
		}

		function Kpi({ label, value, last }) {
			return react_jsx_runtime.jsxs("div", { style: { ...analysisStyles.kpi, borderRight: last ? 0 : analysisStyles.kpi.borderRight }, children: [
				react_jsx_runtime.jsx("div", { style: analysisStyles.kpiLabel, children: label }),
				react_jsx_runtime.jsx("div", { style: analysisStyles.kpiValue, children: value })
			] });
		}

		function ShareCell({ value }) {
			return react_jsx_runtime.jsxs("div", { style: { display: "flex", alignItems: "center", gap: 10, justifyContent: "flex-end" }, children: [
				react_jsx_runtime.jsx("span", { children: value.toFixed(1) + "%" }),
				react_jsx_runtime.jsx("span", { style: analysisStyles.barTrack, "aria-hidden": "true", children:
					react_jsx_runtime.jsx("span", { style: { ...analysisStyles.barFill, width: Math.max(2, Math.min(100, value)) + "%" } })
				})
			] });
		}

		function Metric({ label, value, cost }) {
			return react_jsx_runtime.jsxs("div", { style: analysisStyles.metric, children: [
				react_jsx_runtime.jsx("div", { style: { ...analysisStyles.metricValue, ...(cost ? analysisStyles.metricCost : {}) }, title: String(value), children: value }),
				react_jsx_runtime.jsx("div", { style: analysisStyles.metricLabel, children: label })
			] });
		}

		function ShareBlock({ value, label }) {
			const pct = Math.max(0, Math.min(100, value));
			return react_jsx_runtime.jsxs("div", { style: analysisStyles.shareBlock, children: [
				react_jsx_runtime.jsx("div", { style: analysisStyles.shareText, children: label + " " + value.toFixed(1) + "%" }),
				react_jsx_runtime.jsx("div", { style: analysisStyles.barTrackWide, "aria-hidden": "true", children:
					react_jsx_runtime.jsx("div", { style: { ...analysisStyles.barFill, width: Math.max(2, pct) + "%" } })
				})
			] });
		}

		function OverviewTable({ mode, overview, t }) {
			const rows = mode === "model" ? overview.modelRows : overview.assetRows;
			const totalCost = overview.summary.totalCostUsd || 0;
			if (rows.length === 0) return react_jsx_runtime.jsx("div", { style: analysisStyles.status, children: t("analysis.empty") });
			if (mode === "asset") {
				return react_jsx_runtime.jsx("div", { style: analysisStyles.listWrap, children: rows.map((row, index) => {
						const share = totalCost > 0 ? row.costUsd / totalCost * 100 : 0;
						const type = row.type === "plugin" ? "插件" : row.type === "file" ? "文件" : "工作区";
						return react_jsx_runtime.jsxs("div", { style: { ...analysisStyles.listRow, borderBottom: index === rows.length - 1 ? 0 : analysisStyles.listRow.borderBottom }, children: [
							react_jsx_runtime.jsxs("div", { style: analysisStyles.listTop, children: [
								react_jsx_runtime.jsxs("div", { style: analysisStyles.itemBlock, children: [
									react_jsx_runtime.jsx("div", { style: analysisStyles.itemName, children: row.name }),
									react_jsx_runtime.jsx("div", { style: analysisStyles.itemMeta, title: row.path, children: type + " · " + row.path })
								] }),
								react_jsx_runtime.jsx(ShareBlock, { value: share, label: t("analysis.costShare") })
							] }),
							react_jsx_runtime.jsxs("div", { style: analysisStyles.metricGrid, children: [
								react_jsx_runtime.jsx(Metric, { label: t("table.cost"), value: fmtUsd(row.costUsd), cost: true }),
								react_jsx_runtime.jsx(Metric, { label: t("analysis.requests"), value: fmtTokens(row.requestCount) }),
								react_jsx_runtime.jsx(Metric, { label: t("analysis.sessions"), value: fmtTokens(row.sessionCount) }),
								react_jsx_runtime.jsx(Metric, { label: t("analysis.inputTokens"), value: fmtTokens(tokenTotal(row.tokens)) }),
								react_jsx_runtime.jsx(Metric, { label: t("analysis.outputTokens"), value: fmtTokens(row.tokens?.output ?? 0) }),
								react_jsx_runtime.jsx(Metric, { label: t("analysis.type"), value: type })
							] })
						] }, row.id);
					}) });
			}
			return react_jsx_runtime.jsx("div", { style: analysisStyles.listWrap, children: rows.map((row, index) => {
					const share = totalCost > 0 ? row.costUsd / totalCost * 100 : 0;
					return react_jsx_runtime.jsxs("div", { style: { ...analysisStyles.listRow, borderBottom: index === rows.length - 1 ? 0 : analysisStyles.listRow.borderBottom }, children: [
						react_jsx_runtime.jsxs("div", { style: analysisStyles.listTop, children: [
							react_jsx_runtime.jsxs("div", { style: analysisStyles.itemBlock, children: [
								react_jsx_runtime.jsx("div", { style: analysisStyles.itemName, children: row.model }),
								react_jsx_runtime.jsx("div", { style: analysisStyles.itemMeta, children: row.provider })
							] }),
							react_jsx_runtime.jsx(ShareBlock, { value: share, label: t("analysis.costShare") })
						] }),
						react_jsx_runtime.jsxs("div", { style: analysisStyles.metricGrid, children: [
							react_jsx_runtime.jsx(Metric, { label: t("table.cost"), value: fmtUsd(row.costUsd), cost: true }),
							react_jsx_runtime.jsx(Metric, { label: t("analysis.requests"), value: fmtTokens(row.requestCount) }),
							react_jsx_runtime.jsx(Metric, { label: t("analysis.inputTokens"), value: fmtTokens(tokenTotal(row.tokens)) }),
							react_jsx_runtime.jsx(Metric, { label: t("analysis.outputTokens"), value: fmtTokens(row.tokens?.output ?? 0) }),
							react_jsx_runtime.jsx(Metric, { label: t("tokens.cacheRead"), value: fmtTokens(row.tokens?.cacheRead ?? 0) }),
							react_jsx_runtime.jsx(Metric, { label: t("tokens.cacheWrite"), value: fmtTokens(row.tokens?.cacheWrite ?? 0) })
							] })
						] }, row.provider + "\u0000" + row.model);
				}) });
		}

		function CostAnalysisSettings({ t }) {
			const [mode, setMode] = react.useState("model");
			const [range, setRange] = react.useState("7");
			const [state, setState] = react.useState({ status: "loading" });
			react.useEffect(() => {
				let active = true;
				setState({ status: "loading" });
				fetchOverview(range).then((overview) => {
					if (active) setState({ status: "ready", overview });
				}, () => {
					if (active) setState({ status: "error" });
				});
				return () => { active = false; };
			}, [range]);
			const overview = state.status === "ready" ? state.overview : null;
			return react_jsx_runtime.jsxs("section", { style: analysisStyles.root, children: [
				react_jsx_runtime.jsxs("header", { style: analysisStyles.header, children: [
					react_jsx_runtime.jsx("h2", { style: analysisStyles.title, children: t("analysis.title") }),
					react_jsx_runtime.jsx("p", { style: analysisStyles.desc, children: t("analysis.desc") })
				] }),
				react_jsx_runtime.jsxs("div", { style: analysisStyles.controls, children: [
					react_jsx_runtime.jsxs("div", { style: analysisStyles.seg, children: [
						react_jsx_runtime.jsx("button", { type: "button", style: { ...analysisStyles.segButton, ...(mode === "model" ? analysisStyles.segButtonActive : {}) }, onClick: () => setMode("model"), children: t("analysis.modelTab") }),
						react_jsx_runtime.jsx("button", { type: "button", style: { ...analysisStyles.segButton, ...(mode === "asset" ? analysisStyles.segButtonActive : {}) }, onClick: () => setMode("asset"), children: t("analysis.assetTab") })
					] }),
					react_jsx_runtime.jsxs("div", { style: analysisStyles.rangeSeg, role: "group", "aria-label": "cost range", children: [
						react_jsx_runtime.jsx("button", { type: "button", style: { ...analysisStyles.rangeButton, ...(range === "7" ? analysisStyles.rangeButtonActive : {}) }, onClick: () => setRange("7"), children: t("analysis.range7") }),
						react_jsx_runtime.jsx("button", { type: "button", style: { ...analysisStyles.rangeButton, ...(range === "30" ? analysisStyles.rangeButtonActive : {}) }, onClick: () => setRange("30"), children: t("analysis.range30") }),
						react_jsx_runtime.jsx("button", { type: "button", style: { ...analysisStyles.rangeButton, borderRight: 0, ...(range === "all" ? analysisStyles.rangeButtonActive : {}) }, onClick: () => setRange("all"), children: t("analysis.rangeAll") })
					] })
				] }),
				state.status === "loading" ? react_jsx_runtime.jsx("div", { style: analysisStyles.status, children: t("analysis.loading") }) : null,
				state.status === "error" ? react_jsx_runtime.jsx("div", { style: { ...analysisStyles.status, color: "var(--dsw-alias-state-error-primary, #c33)" }, children: t("analysis.error") }) : null,
				overview !== null ? react_jsx_runtime.jsxs(react_jsx_runtime.Fragment, { children: [
					react_jsx_runtime.jsxs("div", { style: analysisStyles.kpis, children: [
						react_jsx_runtime.jsx(Kpi, { label: t("analysis.totalCost"), value: fmtUsd(overview.summary.totalCostUsd) }),
						react_jsx_runtime.jsx(Kpi, { label: t("analysis.requests"), value: fmtTokens(overview.summary.requestCount) }),
						react_jsx_runtime.jsx(Kpi, { label: t("analysis.inputTokens"), value: fmtTokens(tokenTotal(overview.summary.tokens)) }),
						react_jsx_runtime.jsx(Kpi, { label: t("analysis.outputTokens"), value: fmtTokens(overview.summary.tokens?.output ?? 0), last: true })
					] }),
					react_jsx_runtime.jsxs("div", { style: analysisStyles.section, children: [
						react_jsx_runtime.jsx("div", { style: analysisStyles.sectionHead, children:
							react_jsx_runtime.jsx("div", { style: analysisStyles.sectionTitle, children: mode === "model" ? t("analysis.modelDist") : t("analysis.assetDist") })
						}),
						react_jsx_runtime.jsx(OverviewTable, { mode, overview, t })
					] })
				] }) : null
			] });
		}

		function CostView({ useSession, useProjection, t }) {
			const cost = useSession((s) => s.views.get("cost") ?? EMPTY_COST_SNAPSHOT);
			const tokenUsage = useProjection("tokenUsage");
			const costStats = useProjection("costStats");

			// 权威全日志按模型聚合费用（host 侧 costStats 投影，pi-ai 官方价）
			const rows = (costStats?.rows ?? []).map((r) => ({ ...r }));
			const windowCost = rows.reduce((sum, r) => sum + (r.cost ?? 0), 0);

			// provider+model → 单价 查找表，供窗口内请求明细计价
			const priceByKey = {};
			for (const r of rows) if (r.price !== null && r.price !== void 0) priceByKey[r.provider + "\u0000" + r.model] = r.price;

			// 每次请求（一次模型调用）的明细，窗口内按请求顺序。
			// request/header 可能落在已加载窗口之外（被分页），此时模型归 unknown；
			// 单模型会话回退到投影的唯一模型归属，避免「模型未知」。
			const soleModel = rows.length === 1 ? rows[0] : null;
			const requests = (cost.requests ?? []).map((r, i) => {
				const provider = r.provider === "unknown" && soleModel !== null ? soleModel.provider : r.provider;
				const model = r.model === "unknown" && soleModel !== null ? soleModel.model : r.model;
				const p = priceByKey[provider + "\u0000" + model] ?? null;
				const reqCost = p === null ? null
					: (r.uncached * p.input + r.cacheRead * p.cacheRead + r.cacheWrite * p.cacheWrite + r.output * p.output) / 1e6;
				return { ...r, provider, model, index: i + 1, cost: reqCost };
			});

			// 权威全日志 token 总量（优先用 tokenUsage 投影，缺省退回 costStats 聚合）
			const uncached = tokenUsage !== void 0 ? (tokenUsage.uncachedInputTokens ?? 0) : (costStats?.totals?.uncached ?? 0);
			const cacheRead = tokenUsage !== void 0 ? (tokenUsage.cacheReadTokens ?? 0) : (costStats?.totals?.cacheRead ?? 0);
			const cacheWrite = tokenUsage !== void 0 ? (tokenUsage.cacheWriteTokens ?? 0) : (costStats?.totals?.cacheWrite ?? 0);
			const output = tokenUsage !== void 0 ? (tokenUsage.outputTokens ?? 0) : (costStats?.totals?.output ?? 0);
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
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "cost-analysis",
				order: 40,
				locale: NS,
				label: () => t("analysis.nav")
			}, () => react_jsx_runtime.jsx(CostAnalysisSettings, { t })));
		}
		//#endregion

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
