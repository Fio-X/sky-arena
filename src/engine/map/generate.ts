import type { MapNode, MapState, RoomType } from "../core/types";
import { createJavaRandom, javaShuffle, nextInt } from "../rng/javaRandom";

/**
 * Map generation matching the original game's algorithm.
 * Grid: 7 columns × 15 rows, 6 paths from bottom to top.
 *
 * Fixed rows: 0 = monster, 8 = treasure, 14 = rest site
 * Row 15 (off-grid) = boss
 *
 * Per-act seed offsets: Act 1 = seed+1, Act 2 = seed+200, Act 3 = seed+600
 */
export function generateMap(seed: bigint, act: number, ascension = 0): MapState {
	const actOffset = act === 1 ? 1n : act === 2 ? 200n : 600n;
	const mapSeed = seed + actOffset;
	let rng = createJavaRandom(mapSeed);

	const { paths, rng: pathRng } = generatePaths(rng);
	rng = pathRng;

	const nodes = buildNodeGrid(paths);

	assignRoomTypes(nodes, rng, ascension);
	addBossRow(nodes);

	return { nodes, currentNode: null, visitedNodes: [] };
}

function generatePaths(rng: ReturnType<typeof createJavaRandom>) {
	const paths: Array<{ x: number; y: number }[]> = [];
	for (let p = 0; p < 6; p++) {
		const path: Array<{ x: number; y: number }> = [];
		const startResult = nextInt(rng, 7);
		let col = startResult.value;
		rng = startResult.state;

		for (let row = 0; row < 15; row++) {
			path.push({ x: col, y: row });
			if (row < 14) {
				const driftResult = nextInt(rng, 3);
				rng = driftResult.state;
				col = Math.max(0, Math.min(6, col + driftResult.value - 1));
			}
		}
		paths.push(path);
	}
	return { paths, rng };
}

function buildNodeGrid(paths: Array<{ x: number; y: number }[]>): MapNode[][] {
	const nodes: MapNode[][] = Array.from({ length: 15 }, (_, y) =>
		Array.from({ length: 7 }, (_, x) => ({
			x,
			y,
			type: "monster" as RoomType,
			edges: [],
		})),
	);

	for (const path of paths) {
		for (let i = 0; i < path.length - 1; i++) {
			const from = path[i];
			const to = path[i + 1];
			if (!from || !to) continue;
			const node = nodes[from.y]?.[from.x];
			if (!node) continue;
			if (!node.edges.some((e) => e.x === to.x && e.y === to.y)) {
				node.edges.push({ x: to.x, y: to.y });
			}
		}
	}
	return nodes;
}

function addBossRow(nodes: MapNode[][]): void {
	const bossNode: MapNode = { x: 3, y: 15, type: "boss", edges: [] };
	const bossRow: MapNode[] = Array.from({ length: 7 }, (_, x) =>
		x === 3 ? bossNode : { x, y: 15, type: "boss" as RoomType, edges: [] },
	);
	nodes.push(bossRow);
	for (const node of nodes[14] ?? []) {
		if (isOnPath(nodes, node.x, 14)) {
			node.edges.push({ x: 3, y: 15 });
		}
	}
}

function assignRoomTypes(
	nodes: MapNode[][],
	rng: ReturnType<typeof createJavaRandom>,
	ascension: number,
): void {
	// Fixed rows
	setRowType(nodes, 0, "monster");
	setRowType(nodes, 8, "treasure");
	setRowType(nodes, 14, "rest");

	// Collect assignable nodes (non-fixed rows, part of a path)
	const assignable: Array<{ x: number; y: number }> = [];
	for (let y = 1; y < 15; y++) {
		if (y === 8 || y === 14) continue;
		for (let x = 0; x < 7; x++) {
			if (isOnPath(nodes, x, y)) {
				assignable.push({ x, y });
			}
		}
	}

	// Row 13 nodes count as assignable but are excluded from the total for proportional counts
	const row13Count = assignable.filter((n) => n.y === 13).length;
	const totalForProportions = assignable.length - row13Count;

	// Build room type array by proportions
	const eliteRate = ascension > 0 ? 0.128 : 0.08;
	const shopCount = Math.round(totalForProportions * 0.05);
	const restCount = Math.round(totalForProportions * 0.12);
	const eliteCount = Math.round(totalForProportions * eliteRate);
	const eventCount = Math.round(totalForProportions * 0.22);
	const monsterCount = assignable.length - shopCount - restCount - eliteCount - eventCount;

	const typePool: RoomType[] = [
		...Array(shopCount).fill("shop"),
		...Array(restCount).fill("rest"),
		...Array(eliteCount).fill("elite"),
		...Array(eventCount).fill("event"),
		...Array(Math.max(0, monsterCount)).fill("monster"),
	];

	// Shuffle
	javaShuffle(typePool, rng);

	// Assign with veto rules
	let poolIdx = 0;
	for (const pos of assignable) {
		const node = nodes[pos.y]?.[pos.x];
		if (!node) continue;

		let assigned = false;
		for (let attempt = poolIdx; attempt < typePool.length; attempt++) {
			const candidate = typePool[attempt];
			if (candidate && !isVetoed(nodes, pos.x, pos.y, candidate)) {
				(node as { type: RoomType }).type = candidate;
				typePool[attempt] = typePool[poolIdx] as RoomType;
				poolIdx++;
				assigned = true;
				break;
			}
		}
		if (!assigned) {
			(node as { type: RoomType }).type = "monster";
			poolIdx++;
		}
	}
}

function setRowType(nodes: MapNode[][], y: number, type: RoomType): void {
	for (let x = 0; x < 7; x++) {
		const node = nodes[y]?.[x];
		if (node && isOnPath(nodes, x, y)) {
			(node as { type: RoomType }).type = type;
		}
	}
}

function isOnPath(nodes: MapNode[][], x: number, y: number): boolean {
	const node = nodes[y]?.[x];
	if (!node) return false;
	if (node.edges.length > 0) return true;
	// Last row: check if any node points to it
	if (y === 14) {
		const prevRow = nodes[y - 1];
		if (prevRow) {
			return prevRow.some((n) => n.edges.some((e) => e.x === x && e.y === y));
		}
	}
	return false;
}

function isVetoed(nodes: MapNode[][], x: number, y: number, type: RoomType): boolean {
	if (type === "elite" && y <= 4) return true;
	if (type === "rest" && (y <= 4 || y >= 13)) return true;
	if (hasSiblingOfType(nodes, x, y, type)) return true;
	if (hasParentOfType(nodes, x, y, type)) return true;
	return false;
}

function hasSiblingOfType(nodes: MapNode[][], x: number, y: number, type: RoomType): boolean {
	const row = nodes[y];
	if (!row) return false;
	const SIBLING_VETOED: Set<RoomType> = new Set(["event", "monster", "shop", "rest", "elite"]);
	if (!SIBLING_VETOED.has(type)) return false;
	return row.some((n) => n.x !== x && n.type === type);
}

function hasParentOfType(nodes: MapNode[][], x: number, y: number, type: RoomType): boolean {
	if (y <= 0 || type === "monster" || type === "event") return false;
	const prevRow = nodes[y - 1];
	if (!prevRow) return false;
	return prevRow.some((n) => n.edges.some((e) => e.x === x && e.y === y) && n.type === type);
}
