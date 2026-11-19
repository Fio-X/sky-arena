import { motion } from "framer-motion";
import type { MapNode, RoomType } from "../../engine/core/types";
import { tUiFmt } from "../../i18n";
import { useGameStore } from "../../store/gameStore";

// ── Colors per room type ──────────────────────────────────
const ROOM_COLORS: Record<RoomType, string> = {
	monster: "#ff3c6f",
	elite: "#ff3c6f",
	rest: "#00e88f",
	shop: "#ffc830",
	treasure: "#ffc830",
	event: "#6c5ce7",
	boss: "#ff3c6f",
};

const ROOM_GLOW: Record<RoomType, string> = {
	monster: "rgba(255, 60, 111, 0.5)",
	elite: "rgba(255, 60, 111, 0.6)",
	rest: "rgba(0, 232, 143, 0.5)",
	shop: "rgba(255, 200, 48, 0.5)",
	treasure: "rgba(255, 200, 48, 0.5)",
	event: "rgba(108, 92, 231, 0.5)",
	boss: "rgba(255, 60, 111, 0.7)",
};

const ROOM_LABELS: Record<RoomType, string> = {
	monster: "Monster",
	elite: "Elite",
	rest: "Rest",
	shop: "Shop",
	treasure: "Treasure",
	event: "Event",
	boss: "Boss",
};

// ── Layout ────────────────────────────────────────────────
const NODE_SIZE = 44;
const BOSS_SIZE = 58;
const COL_GAP = 56;
const ROW_GAP = 56;
const COLS = 7;
const PAD = 30;

function nodeCenter(x: number, y: number, maxY: number): { cx: number; cy: number } {
	const cx = x * COL_GAP + NODE_SIZE / 2;
	const cy = (maxY - y) * ROW_GAP + NODE_SIZE / 2;
	return { cx, cy };
}

// ── SVG icon components per room type ─────────────────────
function RoomIcon({ type, size }: { type: RoomType; size: number }) {
	const s = size * 0.52;
	const color = ROOM_COLORS[type];
	const half = s / 2;

	switch (type) {
		case "monster":
			return (
				<g>
					<line
						x1={-half}
						y1={-half}
						x2={half}
						y2={half}
						stroke={color}
						strokeWidth={2.2}
						strokeLinecap="round"
					/>
					<line
						x1={half}
						y1={-half}
						x2={-half}
						y2={half}
						stroke={color}
						strokeWidth={2.2}
						strokeLinecap="round"
					/>
					<line
						x1={-half - 2}
						y1={-half + 3}
						x2={-half + 3}
						y2={-half - 2}
						stroke={color}
						strokeWidth={1.8}
						strokeLinecap="round"
					/>
					<line
						x1={half + 2}
						y1={-half + 3}
						x2={half - 3}
						y2={-half - 2}
						stroke={color}
						strokeWidth={1.8}
						strokeLinecap="round"
					/>
				</g>
			);
		case "elite":
			return (
				<g>
					<circle cx={0} cy={-1} r={half * 0.72} fill="none" stroke={color} strokeWidth={1.8} />
					<circle cx={-half * 0.25} cy={-2} r={1.6} fill={color} />
					<circle cx={half * 0.25} cy={-2} r={1.6} fill={color} />
					<line
						x1={-2}
						y1={half * 0.4}
						x2={2}
						y2={half * 0.4}
						stroke={color}
						strokeWidth={1.4}
						strokeLinecap="round"
					/>
				</g>
			);
		case "rest":
			return (
				<g>
					<path
						d={`M0,${-half * 0.9} C${half * 0.5},${-half * 0.3} ${half * 0.6},${half * 0.3} 0,${half * 0.7} C${-half * 0.6},${half * 0.3} ${-half * 0.5},${-half * 0.3} 0,${-half * 0.9}Z`}
						fill={color}
						opacity={0.85}
					/>
					<path
						d={`M0,${-half * 0.3} C${half * 0.25},0 ${half * 0.3},${half * 0.2} 0,${half * 0.5} C${-half * 0.3},${half * 0.2} ${-half * 0.25},0 0,${-half * 0.3}Z`}
						fill="#ffe066"
						opacity={0.9}
					/>
				</g>
			);
		case "shop":
			return (
				<g>
					<circle cx={0} cy={0} r={half * 0.7} fill="none" stroke={color} strokeWidth={1.8} />
					<text
						x={0}
						y={1.5}
						textAnchor="middle"
						dominantBaseline="middle"
						fill={color}
						fontSize={s * 0.5}
						fontWeight={700}
						fontFamily="Inter, sans-serif"
					>
						$
					</text>
				</g>
			);
		case "treasure":
			return (
				<g>
					<rect
						x={-half * 0.65}
						y={-half * 0.2}
						width={half * 1.3}
						height={half * 0.9}
						rx={1.5}
						fill="none"
						stroke={color}
						strokeWidth={1.8}
					/>
					<path
						d={`M${-half * 0.65},${-half * 0.2} Q0,${-half * 0.7} ${half * 0.65},${-half * 0.2}`}
						fill="none"
						stroke={color}
						strokeWidth={1.8}
					/>
					<circle cx={0} cy={half * 0.15} r={1.5} fill={color} />
				</g>
			);
		case "event":
			return (
				<g>
					<circle cx={0} cy={0} r={half * 0.75} fill="none" stroke={color} strokeWidth={1.6} />
					<text
						x={0}
						y={1.5}
						textAnchor="middle"
						dominantBaseline="middle"
						fill={color}
						fontSize={s * 0.6}
						fontWeight={700}
						fontFamily="Inter, sans-serif"
					>
						?
					</text>
				</g>
			);
		case "boss":
			return (
				<g>
					<path
						d={`M${-half * 0.7},${half * 0.3} L${-half * 0.7},${-half * 0.1} L${-half * 0.35},${half * 0.1} L0,${-half * 0.5} L${half * 0.35},${half * 0.1} L${half * 0.7},${-half * 0.1} L${half * 0.7},${half * 0.3}Z`}
						fill="none"
						stroke={color}
						strokeWidth={2}
						strokeLinejoin="round"
					/>
					<circle cx={-half * 0.7} cy={-half * 0.2} r={1.4} fill={color} />
					<circle cx={0} cy={-half * 0.6} r={1.4} fill={color} />
					<circle cx={half * 0.7} cy={-half * 0.2} r={1.4} fill={color} />
				</g>
			);
	}
}

// ── Helpers for node styling ──────────────────────────────
function nodeBackground(isCurrent: boolean, isBoss: boolean, reachable: boolean): string {
	if (isCurrent) {
		const inner = isBoss ? "rgba(30, 15, 25, 0.9)" : "rgba(20, 18, 50, 0.9)";
		return `radial-gradient(circle at 40% 35%, rgba(255,255,255,0.08), ${inner})`;
	}
	if (reachable) {
		return "radial-gradient(circle at 40% 35%, rgba(255,255,255,0.06), rgba(20, 18, 50, 0.85))";
	}
	return "rgba(14, 12, 36, 0.8)";
}

function nodeShadow(
	isCurrent: boolean,
	reachable: boolean,
	visited: boolean,
	color: string,
	glow: string,
): string {
	if (isCurrent) {
		return `0 0 0 2px ${color}, 0 0 16px ${glow}, 0 0 30px ${glow}`;
	}
	if (reachable) {
		return `0 0 0 1.5px ${color}, 0 0 12px ${glow}`;
	}
	if (visited) {
		return "0 0 0 1px rgba(42, 40, 80, 0.5)";
	}
	return "0 0 0 1px var(--border)";
}

// ── Single map node ───────────────────────────────────────
function MapNodeButton({
	node,
	maxY,
	reachable,
	visited,
	isCurrent,
	onChoose,
}: {
	node: MapNode;
	maxY: number;
	reachable: boolean;
	visited: boolean;
	isCurrent: boolean;
	onChoose: () => void;
}) {
	const { cx, cy } = nodeCenter(node.x, node.y, maxY);
	const isBoss = node.type === "boss";
	const size = isBoss ? BOSS_SIZE : NODE_SIZE;
	const color = ROOM_COLORS[node.type];
	const glow = ROOM_GLOW[node.type];

	const bounceAnim = reachable && !isCurrent ? { y: [0, -3, 0] } : {};
	const bounceTrans =
		reachable && !isCurrent
			? {
					y: {
						duration: 2,
						repeat: Number.POSITIVE_INFINITY,
						ease: "easeInOut" as const,
					},
				}
			: {};

	return (
		<motion.button
			type="button"
			onClick={() => reachable && onChoose()}
			disabled={!reachable}
			initial={{ opacity: 0, scale: 0.3 }}
			animate={{
				opacity: visited && !isCurrent ? 0.4 : 1,
				scale: 1,
				...bounceAnim,
			}}
			transition={{
				duration: 0.5,
				delay: (maxY - node.y) * 0.04 + node.x * 0.02,
				...bounceTrans,
			}}
			style={{
				position: "absolute",
				left: cx - size / 2 + PAD,
				top: cy - size / 2 + PAD,
				width: size,
				height: size,
				borderRadius: "50%",
				border: "none",
				padding: 0,
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				background: nodeBackground(isCurrent, isBoss, reachable),
				backdropFilter: "blur(8px)",
				boxShadow: nodeShadow(isCurrent, reachable, visited, color, glow),
				zIndex: isCurrent ? 10 : reachable ? 5 : 1,
				cursor: reachable ? "pointer" : "default",
				outline: "none",
			}}
			title={`${node.type} (${node.x},${node.y})`}
			whileHover={reachable ? { scale: 1.15 } : undefined}
			whileTap={reachable ? { scale: 0.95 } : undefined}
		>
			{isCurrent && (
				<motion.span
					animate={{ scale: [1, 1.5, 1], opacity: [0.6, 0, 0.6] }}
					transition={{
						duration: 2,
						repeat: Number.POSITIVE_INFINITY,
						ease: "easeInOut",
					}}
					style={{
						position: "absolute",
						inset: -4,
						borderRadius: "50%",
						border: `2px solid ${color}`,
						pointerEvents: "none",
					}}
				/>
			)}
			{reachable && !isCurrent && (
				<motion.span
					animate={{ opacity: [0.4, 0.8, 0.4] }}
					transition={{
						duration: 1.5,
						repeat: Number.POSITIVE_INFINITY,
						ease: "easeInOut",
					}}
					style={{
						position: "absolute",
						inset: -2,
						borderRadius: "50%",
						border: `1.5px solid ${color}`,
						pointerEvents: "none",
					}}
				/>
			)}
			<svg
				role="img"
				aria-label={ROOM_LABELS[node.type]}
				width={size * 0.6}
				height={size * 0.6}
				viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`}
				style={{ overflow: "visible" }}
			>
				<RoomIcon type={node.type} size={size} />
			</svg>
		</motion.button>
	);
}

// ── Edge rendering ────────────────────────────────────────
interface EdgeData {
	x1: number;
	y1: number;
	x2: number;
	y2: number;
	reachable: boolean;
	visited: boolean;
}

function MapEdge({ e, defsId }: { e: EdgeData; defsId: string }) {
	if (e.reachable) {
		return (
			<g>
				<line
					x1={e.x1}
					y1={e.y1}
					x2={e.x2}
					y2={e.y2}
					stroke="#00e88f"
					strokeWidth={5}
					strokeOpacity={0.2}
					filter={`url(#${defsId}-pathGlow)`}
				/>
				<line
					x1={e.x1}
					y1={e.y1}
					x2={e.x2}
					y2={e.y2}
					stroke={`url(#${defsId}-reachGrad)`}
					strokeWidth={2.5}
					strokeLinecap="round"
				/>
			</g>
		);
	}
	if (e.visited) {
		return (
			<line
				x1={e.x1}
				y1={e.y1}
				x2={e.x2}
				y2={e.y2}
				stroke="var(--text-dim)"
				strokeWidth={1.5}
				strokeOpacity={0.25}
				strokeDasharray="4 4"
			/>
		);
	}
	return (
		<line
			x1={e.x1}
			y1={e.y1}
			x2={e.x2}
			y2={e.y2}
			stroke="var(--border)"
			strokeWidth={1.2}
			strokeOpacity={0.5}
			strokeDasharray="3 5"
		/>
	);
}

// ── Main component ────────────────────────────────────────
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

	const edges: EdgeData[] = [];
	for (const row of nodes) {
		for (const node of row) {
			if (!isOnPath(node)) continue;
			for (const edge of node.edges) {
				const from = nodeCenter(node.x, node.y, maxY);
				const to = nodeCenter(edge.x, edge.y, maxY);
				const reachable = currentNode?.x === node.x && currentNode?.y === node.y;
				const visited =
					visitedSet.has(`${node.x},${node.y}`) && visitedSet.has(`${edge.x},${edge.y}`);
				edges.push({
					x1: from.cx,
					y1: from.cy,
					x2: to.cx,
					y2: to.cy,
					reachable,
					visited,
				});
			}
		}
	}

	const defsId = "map";

	return (
		<div
			style={{
				height: "calc(100vh - 36px)",
				overflow: "auto",
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				padding: "1rem",
				background:
					"radial-gradient(ellipse at 50% 30%, rgba(108, 92, 231, 0.08) 0%, transparent 70%)",
			}}
		>
			<motion.h2
				initial={{ opacity: 0, y: -10 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.5 }}
				style={{
					marginBottom: "1rem",
					color: "var(--text-dim)",
					letterSpacing: "0.08em",
					textTransform: "uppercase",
					fontSize: "0.85rem",
					fontWeight: 600,
				}}
			>
				{tUiFmt("map", String(state.act))}
			</motion.h2>

			<div
				style={{
					position: "relative",
					width: gridW + PAD * 2,
					height: gridH + PAD * 2,
				}}
			>
				<svg
					aria-hidden="true"
					style={{
						position: "absolute",
						top: 0,
						left: 0,
						width: gridW + PAD * 2,
						height: gridH + PAD * 2,
						pointerEvents: "none",
					}}
				>
					<defs>
						<linearGradient id={`${defsId}-reachGrad`} x1="0%" y1="100%" x2="0%" y2="0%">
							<stop offset="0%" stopColor="#00e88f" stopOpacity={0.9} />
							<stop offset="100%" stopColor="#00e88f" stopOpacity={0.4} />
						</linearGradient>
						<filter id={`${defsId}-pathGlow`} x="-50%" y="-50%" width="200%" height="200%">
							<feGaussianBlur stdDeviation="3" result="blur" />
							<feMerge>
								<feMergeNode in="blur" />
								<feMergeNode in="SourceGraphic" />
							</feMerge>
						</filter>
					</defs>

					<circle
						cx={gridW * 0.3 + PAD}
						cy={gridH * 0.4 + PAD}
						r={120}
						fill="rgba(108, 92, 231, 0.03)"
					/>
					<circle
						cx={gridW * 0.7 + PAD}
						cy={gridH * 0.6 + PAD}
						r={100}
						fill="rgba(0, 232, 143, 0.02)"
					/>

					<g transform={`translate(${PAD}, ${PAD})`}>
						{edges.map((e) => (
							<MapEdge key={`${e.x1},${e.y1}-${e.x2},${e.y2}`} e={e} defsId={defsId} />
						))}
					</g>
				</svg>

				{nodes.map((row) =>
					row.map((node) => {
						if (!isOnPath(node)) return null;
						const reachable = isReachable(node.x, node.y);
						const visited = visitedSet.has(`${node.x},${node.y}`);
						const isCurrent = currentNode?.x === node.x && currentNode?.y === node.y;
						return (
							<MapNodeButton
								key={`${node.x},${node.y}`}
								node={node}
								maxY={maxY}
								reachable={reachable}
								visited={visited}
								isCurrent={isCurrent}
								onChoose={() =>
									dispatch({
										type: "chooseMapNode",
										x: node.x,
										y: node.y,
									})
								}
							/>
						);
					}),
				)}
			</div>
		</div>
	);
}
