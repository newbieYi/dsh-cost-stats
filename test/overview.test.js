import assert from "node:assert/strict";
import test from "node:test";

import {
	aggregateCostOverview,
	collectAssets,
	parseEventCostRows,
} from "../lib/overview.js";

test("aggregates global totals by model and asset for a date range", () => {
	const workspaceRoot = "/repo";
	const sessionCache = {
		tables: {
			sessions: {
				"s-1": {
					identity: { createdAt: Date.UTC(2026, 7, 18), cwd: "/repo/plugins/alpha" },
					rows: {
						title: { val: "Build alpha" },
						sessionStats: { val: { steps: 2 } },
						costStats: {
							val: {
								rows: {
									"promptt\u0000deepseek-v4-pro": {
										provider: "promptt",
										model: "deepseek-v4-pro",
										uncached: 100,
										cacheRead: 200,
										cacheWrite: 0,
										output: 300,
										cost: 0.42,
									},
								},
								totals: { uncached: 100, cacheRead: 200, cacheWrite: 0, output: 300 },
							},
						},
					},
				},
				"s-2": {
					identity: { createdAt: Date.UTC(2026, 7, 10), cwd: "/repo/note.md" },
					rows: {
						title: { val: "Old note" },
						sessionStats: { val: { steps: 4 } },
						costStats: {
							val: {
								rows: {
									"nova\u0000claude-opus-5": {
										provider: "nova",
										model: "claude-opus-5",
										uncached: 10,
										cacheRead: 20,
										cacheWrite: 30,
										output: 40,
										cost: 1.25,
									},
								},
								totals: { uncached: 10, cacheRead: 20, cacheWrite: 30, output: 40 },
							},
						},
					},
				},
				"s-3": {
					identity: { createdAt: Date.UTC(2026, 6, 1), cwd: "/repo/plugins/alpha" },
					rows: {
						sessionStats: { val: { steps: 9 } },
						costStats: {
							val: {
								rows: {
									"promptt\u0000deepseek-v4-pro": {
										provider: "promptt",
										model: "deepseek-v4-pro",
										uncached: 999,
										cacheRead: 999,
										cacheWrite: 999,
										output: 999,
										cost: 9,
									},
								},
								totals: { uncached: 999, cacheRead: 999, cacheWrite: 999, output: 999 },
							},
						},
					},
				},
			},
		},
	};
	const workspaceStore = {
		tables: {
			workspaces: {
				w1: { path: workspaceRoot, title: "Repo", sessionIds: ["s-1", "s-2", "s-3"] },
			},
		},
	};
	const assets = [
		{ id: "/repo/plugins/alpha", name: "alpha", type: "plugin", path: "/repo/plugins/alpha", workspacePath: workspaceRoot },
		{ id: "/repo/note.md", name: "note.md", type: "file", path: "/repo/note.md", workspacePath: workspaceRoot },
	];

	const overview = aggregateCostOverview({
		sessionCache,
		workspaceStore,
		assets,
		now: Date.UTC(2026, 7, 20),
		rangeDays: 14,
	});

	assert.equal(overview.summary.sessionCount, 2);
	assert.equal(overview.summary.requestCount, 6);
	assert.equal(overview.summary.totalCostUsd, 1.67);
	assert.deepEqual(overview.summary.tokens, { uncached: 110, cacheRead: 220, cacheWrite: 30, output: 340 });
	assert.deepEqual(overview.modelRows.map((row) => [row.provider, row.model, row.costUsd, row.requestCount]), [
		["nova", "claude-opus-5", 1.25, 4],
		["promptt", "deepseek-v4-pro", 0.42, 2],
	]);
	assert.deepEqual(overview.assetRows.map((row) => [row.name, row.type, row.costUsd, row.requestCount]), [
		["note.md", "file", 1.25, 4],
		["alpha", "plugin", 0.42, 2],
	]);
});

test("collects direct plugin and file assets under workspaces", () => {
	const files = new Map([
		["/repo/plugins/alpha", { isDirectory: true }],
		["/repo/plugins/alpha/package.json", { isFile: true, text: JSON.stringify({ dsh: { bundle: { patch: "./cordis.patch.yml" } } }) }],
		["/repo/plugins/alpha/cordis.patch.yml", { isFile: true, text: "- insert: []" }],
		["/repo/readme.md", { isFile: true }],
		["/repo/docs", { isDirectory: true }],
	]);

	const assets = collectAssets({
		workspaceStore: { tables: { workspaces: { w1: { path: "/repo", title: "Repo" } } } },
		listEntries(path) {
			if (path === "/repo") return ["plugins", "readme.md", "docs"];
			if (path === "/repo/plugins") return ["alpha"];
			return [];
		},
		stat(path) {
			const entry = files.get(path);
			if (entry === undefined) return null;
			return {
				isDirectory: () => entry.isDirectory === true,
				isFile: () => entry.isFile === true,
			};
		},
		readText(path) {
			return files.get(path)?.text ?? "";
		},
	});

	assert.deepEqual(assets.map((asset) => [asset.name, asset.type, asset.path]), [
		["readme.md", "file", "/repo/readme.md"],
		["alpha", "plugin", "/repo/plugins/alpha"],
	]);
});

test("parses request headers and assistant usage into priced model rows", () => {
	const rows = parseEventCostRows([
		{ type: "request/header", data: { header: { config: { provider: "promptt", model: "deepseek-v4-pro" } } } },
		{ type: "assistant/message", data: { usage: { inputTokens: 100, cacheReadTokens: 200, cacheWriteTokens: 0, outputTokens: 300 } } },
		{ type: "request/header", data: { header: { config: { provider: "nova", model: "claude-opus-5-thinking" } } } },
		{ type: "assistant/message", data: { usage: { inputTokens: 10, cacheReadTokens: 20, cacheWriteTokens: 30, outputTokens: 40 } } },
	], (provider, model) => {
		if (provider === "promptt" && model === "deepseek-v4-pro") return { input: 1, cacheRead: 2, cacheWrite: 3, output: 4 };
		if (provider === "nova" && model === "claude-opus-5-thinking") return { input: 5, cacheRead: 0.5, cacheWrite: 6.25, output: 25 };
		return null;
	});

	assert.deepEqual(rows.map((row) => [row.provider, row.model, row.requests, row.cost]), [
		["promptt", "deepseek-v4-pro", 1, 0.0017],
		["nova", "claude-opus-5-thinking", 1, 0.0012475],
	]);
});

test("does not assign workspace-root sessions to arbitrary child files", () => {
	const overview = aggregateCostOverview({
		sessionCache: {
			tables: {
				sessions: {
					"s-root": {
						identity: { createdAt: 1, cwd: "/repo" },
						rows: {
							sessionStats: { val: { steps: 1 } },
							costStats: {
								val: {
									rows: { "p\u0000m": { provider: "p", model: "m", uncached: 1, cacheRead: 0, cacheWrite: 0, output: 1, cost: 0.1 } },
								},
							},
						},
					},
				},
			},
		},
		workspaceStore: { tables: { workspaces: { w1: { path: "/repo", title: "Repo", sessionIds: ["s-root"] } } } },
		assets: [{ id: "/repo/a.md", name: "a.md", type: "file", path: "/repo/a.md", workspacePath: "/repo" }],
		rangeDays: null,
	});

	assert.deepEqual(overview.assetRows.map((row) => [row.name, row.type, row.path]), [
		["Repo", "workspace", "/repo"],
	]);
});
