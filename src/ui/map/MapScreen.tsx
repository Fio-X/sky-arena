import type { MapNode, RoomType } from "../../engine/core/types";
import { tUiFmt } from "../../i18n";
import { useGameStore } from "../../store/gameStore";

const ROOM_ICONS: Record<RoomType, string> = {
	monster: "M",
	elite: "E",
	rest: "R",
	shop: "$",
	treasure: "T",
	event: "?",
	boss: "B",
};

const ROOM_COLORS: Record<RoomType, string> = {
	monster: "var(--text)",
	elite: "var(--accent)",
	rest: "var(--accent-green)",
	shop: "var(--accent-gold)",
	treasure: "var(--accent-gold)",
	event: "var(--accent-blue)",
	boss: "var(--accent)",
};

const NODE_SIZE = 36;
const COL_GAP = 48;
const ROW_GAP = 48;
const COLS = 7;

function nodeCenter(x: number, y: number, maxY: number): { cx: number; cy: number } {
	const cx = x * COL_GAP + NODE_SIZE / 2;
	const cy = (maxY - y) * ROW_GAP + NODE_SIZE / 2;
	return { cx, cy };
}

export function MapScreen() {
	const state = useGameStore((s) => s.state);
	const dispatch = useGameStore((s) => s.dispatch);
	if (!state) return null;

	const { nodes, currentNode, visitedNodes } = state.map;
	const visitedSet = new Set(visitedNodes.map((v) => `${v.x},${v.y}`));

	const maxY = nodes.length - 1;
	const gridW = COLS * COL_GAP;
	const gridH = (maxY + 1) * ROW_GAP;

	function isReachable(x: number, y: number): boolean {
		if (!currentNode) return y === 0;
		if (y !== currentNode.y + 1) return false;
		const cn = nodes[currentNode.y]?.[currentNode.x];
		return cn?.edges.some((e) => e.x === x && e.y === y) ?? false;
	}

	function isOnPath(node: MapNode): boolean {
		if (node.edges.length > 0) return true;
		if (node.y === maxY) {
			const prevRow = nodes[node.y - 1];
			return prevRow?.some((n) => n.edges.some((e) => e.x === node.x && e.y === node.y)) ?? false;
		}
		return false;
	}

	const edges: Array<{
		x1: number;
		y1: number;
		x2: number;
		y2: number;
		reachable: boolean;
		visited: boolean;
	}> = [];
	for (const row of nodes) {
		for (const node of row) {
			if (!isOnPath(node)) continue;
			for (const edge of node.edges) {
				const from = nodeCenter(node.x, node.y, maxY);
				const to = nodeCenter(edge.x, edge.y, maxY);
				const reachable = currentNode?.x === node.x && currentNode?.y === node.y;
				const visited =
					visitedSet.has(`${node.x},${node.y}`) && visitedSet.has(`${edge.x},${edge.y}`);
				edges.push({ x1: from.cx, y1: from.cy, x2: to.cx, y2: to.cy, reachable, visited });
			}
		}
	}

	return (
		<div
			style={{
				height: "calc(100vh - 36px)",
				overflow: "auto",
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				padding: "1rem",
			}}
		>
			<h2 style={{ marginBottom: "1rem", color: "var(--text-dim)" }}>
				{tUiFmt("map", String(state.act))}
			</h2>
			<div style={{ position: "relative", width: gridW, height: gridH }}>
				<svg
					aria-hidden="true"
					style={{
						position: "absolute",
						top: 0,
						left: 0,
						width: gridW,
						height: gridH,
						pointerEvents: "none",
					}}
				>
					{edges.map((e) => (
						<line
							key={`${e.x1},${e.y1}-${e.x2},${e.y2}`}
							x1={e.x1}
							y1={e.y1}
							x2={e.x2}
							y2={e.y2}
							stroke={
								e.reachable
									? "var(--accent-green)"
									: e.visited
										? "var(--text-dim)"
										: "var(--border)"
							}
							strokeWidth={e.reachable ? 2.5 : 1.5}
							strokeOpacity={e.visited ? 0.4 : 0.7}
						/>
					))}
				</svg>

				{nodes.map((row) =>
					row.map((node) => {
						if (!isOnPath(node)) return null;
						const { cx, cy } = nodeCenter(node.x, node.y, maxY);
						const reachable = isReachable(node.x, node.y);
						const visited = visitedSet.has(`${node.x},${node.y}`);
						const isCurrent = currentNode?.x === node.x && currentNode?.y === node.y;

						return (
							<button
								type="button"
								key={`${node.x},${node.y}`}
								onClick={() =>
									reachable && dispatch({ type: "chooseMapNode", x: node.x, y: node.y })
								}
								disabled={!reachable}
								style={{
									position: "absolute",
									left: cx - NODE_SIZE / 2,
									top: cy - NODE_SIZE / 2,
									width: NODE_SIZE,
									height: NODE_SIZE,
									borderRadius: "50%",
									border: `2px solid ${isCurrent ? "var(--accent)" : reachable ? "var(--accent-green)" : visited ? "var(--text-dim)" : "var(--border)"}`,
									background: isCurrent ? "var(--bg-card)" : "var(--bg-panel)",
									color: ROOM_COLORS[node.type],
									fontWeight: "bold",
									fontSize: "0.8rem",
									padding: 0,
									opacity: visited && !isCurrent ? 0.4 : 1,
									zIndex: 1,
								}}
								title={`${node.type} (${node.x},${node.y})`}
							>
								{ROOM_ICONS[node.type]}
							</button>
						);
					}),
				)}
			</div>
		</div>
	);
}
