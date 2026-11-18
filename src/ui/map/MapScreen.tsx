import type { MapNode, RoomType } from "../../engine/core/types";
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

export function MapScreen() {
	const state = useGameStore((s) => s.state);
	const dispatch = useGameStore((s) => s.dispatch);
	if (!state) return null;

	const { nodes, currentNode, visitedNodes } = state.map;
	const visitedSet = new Set(visitedNodes.map((v) => `${v.x},${v.y}`));

	function isReachable(x: number, y: number): boolean {
		if (!currentNode) return y === 0;
		if (y !== currentNode.y + 1) return false;
		const cn = nodes[currentNode.y]?.[currentNode.x];
		return cn?.edges.some((e) => e.x === x && e.y === y) ?? false;
	}

	function isOnPath(node: MapNode): boolean {
		if (node.edges.length > 0) return true;
		if (node.y === 14) {
			const prevRow = nodes[node.y - 1];
			return prevRow?.some((n) => n.edges.some((e) => e.x === node.x && e.y === node.y)) ?? false;
		}
		return false;
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
			<h2 style={{ marginBottom: "1rem", color: "var(--text-dim)" }}>Act {state.act} Map</h2>
			<div style={{ display: "flex", flexDirection: "column-reverse", gap: "0.5rem" }}>
				{nodes.map((row) => {
					const rowY = row[0]?.y ?? 0;
					return (
						<div
							key={`row-${rowY}`}
							style={{ display: "flex", justifyContent: "center", gap: "0.5rem" }}
						>
							{row.map((node) => {
								if (!isOnPath(node)) return <div key={node.x} style={{ width: 40, height: 40 }} />;

								const reachable = isReachable(node.x, node.y);
								const visited = visitedSet.has(`${node.x},${node.y}`);
								const isCurrent = currentNode?.x === node.x && currentNode?.y === node.y;

								return (
									<button
										type="button"
										key={node.x}
										onClick={() =>
											reachable && dispatch({ type: "chooseMapNode", x: node.x, y: node.y })
										}
										disabled={!reachable}
										style={{
											width: 40,
											height: 40,
											borderRadius: "50%",
											border: `2px solid ${isCurrent ? "var(--accent)" : reachable ? "var(--accent-green)" : visited ? "var(--text-dim)" : "var(--border)"}`,
											background: isCurrent ? "var(--bg-card)" : "var(--bg-panel)",
											color: ROOM_COLORS[node.type],
											fontWeight: "bold",
											fontSize: "0.875rem",
											opacity: visited && !isCurrent ? 0.4 : 1,
										}}
										title={`${node.type} (${node.x},${node.y})`}
									>
										{ROOM_ICONS[node.type]}
									</button>
								);
							})}
						</div>
					);
				})}
			</div>
		</div>
	);
}
