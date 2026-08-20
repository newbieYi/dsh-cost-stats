import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";

const zeroTokens = () => ({ uncached: 0, cacheRead: 0, cacheWrite: 0, output: 0 });

function addTokens(target, source) {
	target.uncached += Number(source?.uncached ?? source?.uncachedInputTokens ?? 0);
	target.cacheRead += Number(source?.cacheRead ?? source?.cacheReadTokens ?? 0);
	target.cacheWrite += Number(source?.cacheWrite ?? source?.cacheWriteTokens ?? 0);
	target.output += Number(source?.output ?? source?.outputTokens ?? 0);
}

function addRowTotals(target, source) {
	addTokens(target.tokens, source);
	target.costUsd += Number(source?.cost ?? source?.costUsd ?? 0);
}

function roundedCost(value) {
	return Math.round(value * 1e6) / 1e6;
}

function isInsideOrSame(parent, child) {
	const rel = relative(resolve(parent), resolve(child));
	return rel === "" || (!rel.startsWith("..") && !rel.startsWith("/"));
}

function directChildDistance(parent, child) {
	const rel = relative(resolve(parent), resolve(child));
	if (rel === "") return 0;
	if (rel.startsWith("..") || rel.startsWith("/")) return Number.POSITIVE_INFINITY;
	return rel.split("/").filter(Boolean).length;
}

function workspacesFromStore(workspaceStore) {
	return Object.values(workspaceStore?.tables?.workspaces ?? {})
		.filter((workspace) => typeof workspace?.path === "string" && workspace.path.length > 0)
		.map((workspace) => ({
			path: workspace.path,
			title: typeof workspace.title === "string" && workspace.title.length > 0 ? workspace.title : basename(workspace.path),
			sessionIds: Array.isArray(workspace.sessionIds) ? workspace.sessionIds.map(String) : [],
		}));
}

function sessionWorkspace(sessionId, session, workspaces) {
	const byList = workspaces.find((workspace) => workspace.sessionIds.includes(sessionId));
	if (byList !== undefined) return byList;
	const cwd = session?.identity?.cwd;
	if (typeof cwd !== "string") return null;
	return workspaces
		.filter((workspace) => isInsideOrSame(workspace.path, cwd))
		.sort((a, b) => b.path.length - a.path.length)[0] ?? null;
}

function classifyAssetForSession(cwd, workspace, assets) {
	if (typeof cwd !== "string" || cwd.length === 0) {
		return {
			id: "unknown",
			name: "未归因",
			type: "workspace",
			path: workspace?.path ?? "",
			workspacePath: workspace?.path ?? "",
		};
	}
	const match = assets
		.filter((asset) => isInsideOrSame(asset.path, cwd))
		.sort((a, b) => directChildDistance(a.path, cwd) - directChildDistance(b.path, cwd) || b.path.length - a.path.length)[0];
	if (match !== undefined) return match;
	return {
		id: workspace?.path ?? cwd,
		name: workspace?.title ?? (basename(cwd) || "工作区本身"),
		type: "workspace",
		path: workspace?.path ?? cwd,
		workspacePath: workspace?.path ?? cwd,
	};
}

export function parseEventCostRows(events, priceFor) {
	let current = { provider: "unknown", model: "unknown" };
	const byModel = new Map();
	for (const event of events) {
		if (event?.type === "request/header") {
			const config = event.data?.header?.config;
			current = {
				provider: typeof config?.provider === "string" ? config.provider : "unknown",
				model: typeof config?.model === "string" ? config.model : "unknown",
			};
			continue;
		}
		if (event?.type !== "assistant/message") continue;
		const usage = event.data?.usage;
		if (usage === null || typeof usage !== "object") continue;
		const key = current.provider + "\u0000" + current.model;
		const row = byModel.get(key) ?? {
			provider: current.provider,
			model: current.model,
			uncached: 0,
			cacheRead: 0,
			cacheWrite: 0,
			output: 0,
			cost: 0,
			requests: 0,
		};
		const uncached = Number(usage.inputTokens ?? 0);
		const cacheRead = Number(usage.cacheReadTokens ?? 0);
		const cacheWrite = Number(usage.cacheWriteTokens ?? 0);
		const output = Number(usage.outputTokens ?? 0);
		if (uncached === 0 && cacheRead === 0 && cacheWrite === 0 && output === 0) continue;
		const price = priceFor?.(row.provider, row.model) ?? null;
		row.uncached += uncached;
		row.cacheRead += cacheRead;
		row.cacheWrite += cacheWrite;
		row.output += output;
		row.requests += 1;
		if (price !== null) {
			row.cost += (uncached * price.input + cacheRead * price.cacheRead + cacheWrite * price.cacheWrite + output * price.output) / 1e6;
		}
		byModel.set(key, row);
	}
	return [...byModel.values()];
}

function parseJsonLines(text) {
	const events = [];
	for (const line of text.split(/\n/)) {
		const trimmed = line.trim();
		if (trimmed.length === 0) continue;
		try {
			events.push(JSON.parse(trimmed));
		} catch {
			continue;
		}
	}
	return events;
}

function readCostRows(session, eventLogs, priceFor) {
	const eventText = eventLogs?.get?.(session.id) ?? eventLogs?.[session.id];
	if (typeof eventText === "string" && eventText.length > 0) {
		return parseEventCostRows(parseJsonLines(eventText), priceFor);
	}
	const costStats = session?.rows?.costStats?.val;
	if (costStats?.rows !== null && typeof costStats?.rows === "object") {
		return Object.values(costStats.rows).map((row) => ({
			provider: String(row.provider ?? "unknown"),
			model: String(row.model ?? "unknown"),
			uncached: Number(row.uncached ?? 0),
			cacheRead: Number(row.cacheRead ?? 0),
			cacheWrite: Number(row.cacheWrite ?? 0),
			output: Number(row.output ?? 0),
			cost: typeof row.cost === "number" ? row.cost : 0,
		}));
	}
	const totals = session?.rows?.tokenUsage?.val?.totals;
	if (totals === undefined) return [];
	return [{
		provider: "unknown",
		model: "unknown",
		uncached: Number(totals.uncachedInputTokens ?? 0),
		cacheRead: Number(totals.cacheReadTokens ?? 0),
		cacheWrite: Number(totals.cacheWriteTokens ?? 0),
		output: Number(totals.outputTokens ?? 0),
		cost: 0,
	}];
}

function requestCountForSession(session, rows) {
	const explicit = rows.reduce((sum, row) => sum + Number(row.requests ?? 0), 0);
	if (explicit > 0) return explicit;
	const steps = session?.rows?.sessionStats?.val?.steps;
	if (typeof steps === "number" && steps > 0) return steps;
	return rows.length;
}

export function aggregateCostOverview({ sessionCache, workspaceStore, assets = [], now = Date.now(), rangeDays = null, eventLogs = null, priceFor = null }) {
	const sessions = sessionCache?.tables?.sessions ?? {};
	const workspaces = workspacesFromStore(workspaceStore);
	const minCreatedAt = typeof rangeDays === "number" && rangeDays > 0 ? now - rangeDays * 24 * 60 * 60 * 1000 : null;
	const summary = {
		totalCostUsd: 0,
		requestCount: 0,
		sessionCount: 0,
		tokens: zeroTokens(),
	};
	const byModel = new Map();
	const byAsset = new Map();

	for (const [sessionId, session] of Object.entries(sessions)) {
		const createdAt = Number(session?.identity?.createdAt ?? 0);
		if (minCreatedAt !== null && createdAt < minCreatedAt) continue;
			const rows = readCostRows({ id: sessionId, ...session }, eventLogs, priceFor);
		if (rows.length === 0) continue;
		const workspace = sessionWorkspace(sessionId, session, workspaces);
		const asset = classifyAssetForSession(session?.identity?.cwd, workspace, assets);
			const requestCount = requestCountForSession(session, rows);
		summary.sessionCount += 1;
		summary.requestCount += requestCount;

		let sessionCost = 0;
		const sessionTokens = zeroTokens();
		for (const row of rows) {
			addTokens(summary.tokens, row);
			addTokens(sessionTokens, row);
			sessionCost += row.cost;
			const modelKey = row.provider + "\u0000" + row.model;
			const model = byModel.get(modelKey) ?? {
				provider: row.provider,
				model: row.model,
				costUsd: 0,
				requestCount: 0,
				tokens: zeroTokens(),
			};
			addRowTotals(model, row);
				model.requestCount += Number(row.requests ?? requestCount);
			byModel.set(modelKey, model);
		}
		summary.totalCostUsd += sessionCost;
		const assetRow = byAsset.get(asset.id) ?? {
			id: asset.id,
			name: asset.name,
			type: asset.type,
			path: asset.path,
			workspacePath: asset.workspacePath,
			costUsd: 0,
			requestCount: 0,
			sessionCount: 0,
			tokens: zeroTokens(),
		};
		addTokens(assetRow.tokens, sessionTokens);
		assetRow.costUsd += sessionCost;
		assetRow.requestCount += requestCount;
		assetRow.sessionCount += 1;
		byAsset.set(asset.id, assetRow);
	}

	const finalizeRow = (row) => ({ ...row, costUsd: roundedCost(row.costUsd) });
	const sortRows = (a, b) => b.costUsd - a.costUsd || b.requestCount - a.requestCount || a.name?.localeCompare?.(b.name ?? "") || 0;
	return {
		generatedAt: now,
		rangeDays,
		summary: { ...summary, totalCostUsd: roundedCost(summary.totalCostUsd) },
		modelRows: [...byModel.values()].map(finalizeRow).sort(sortRows),
		assetRows: [...byAsset.values()].map(finalizeRow).sort(sortRows),
	};
}

function isDshPluginDir(path, readText, stat) {
	const manifestPath = join(path, "package.json");
	const patchPath = join(path, "cordis.patch.yml");
	const manifestStat = stat(manifestPath);
	if (manifestStat?.isFile()) {
		try {
			const manifest = JSON.parse(readText(manifestPath));
			if (manifest?.dsh?.bundle?.patch !== undefined) return true;
		} catch {
			// Fall through to patch-file detection.
		}
	}
	return stat(patchPath)?.isFile() === true;
}

export function collectAssets({
	workspaceStore,
	listEntries = (path) => readdirSync(path),
	stat = (path) => {
		try {
			return statSync(path);
		} catch {
			return null;
		}
	},
	readText = (path) => readFileSync(path, "utf8"),
} = {}) {
	const assets = [];
	for (const workspace of workspacesFromStore(workspaceStore)) {
		const seen = new Set();
		const add = (asset) => {
			if (seen.has(asset.path)) return;
			seen.add(asset.path);
			assets.push({ id: asset.path, workspacePath: workspace.path, ...asset });
		};
		let entries = [];
		try {
			entries = listEntries(workspace.path);
		} catch {
			continue;
		}
		for (const entry of entries) {
			const path = join(workspace.path, entry);
			const entryStat = stat(path);
			if (entryStat?.isFile()) add({ name: entry, type: "file", path });
			if (entryStat?.isDirectory() && isDshPluginDir(path, readText, stat)) add({ name: entry, type: "plugin", path });
		}
		const pluginParents = ["plugins", "DSH插件开发", "dsh实操", "dsh学习"];
		for (const parent of pluginParents) {
			const parentPath = join(workspace.path, parent);
			let children = [];
			try {
				children = listEntries(parentPath);
			} catch {
				continue;
			}
			for (const child of children) {
				const path = join(parentPath, child);
				if (stat(path)?.isDirectory() && isDshPluginDir(path, readText, stat)) add({ name: child, type: "plugin", path });
			}
		}
	}
	return assets.sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
}

export function readJsonFile(path, fallback = {}) {
	if (!existsSync(path)) return fallback;
	try {
		return JSON.parse(readFileSync(path, "utf8"));
	} catch {
		return fallback;
	}
}

export function readSessionEventLogs({ sessionsRoot, maxBuffer = 256 * 1024 * 1024 } = {}) {
	const logs = new Map();
	const walk = (path) => {
		let entries = [];
		try {
			entries = readdirSync(path, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			const child = join(path, entry.name);
			if (entry.isDirectory()) {
				walk(child);
				continue;
			}
			if (entry.name !== "session.jsonl.zstd") continue;
			const result = spawnSync("zstd", ["-dc", child], { encoding: "utf8", maxBuffer });
			if (result.status === 0 && typeof result.stdout === "string") logs.set(basename(path), result.stdout);
		}
	};
	if (typeof sessionsRoot === "string" && sessionsRoot.length > 0) walk(sessionsRoot);
	return logs;
}
