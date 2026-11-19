import { getPotion, getRelic } from "../../engine/content/loader";
import { useGameStore } from "../../store/gameStore";
import { CardPileViewer } from "./CardPileViewer";

export function Hud() {
	const state = useGameStore((s) => s.state);
	if (!state) return null;

	return (
		<div
			style={{
				display: "flex",
				gap: "1rem",
				padding: "0.5rem 1rem",
				background: "linear-gradient(180deg, var(--bg-panel), var(--bg))",
				borderBottom: "1px solid var(--border)",
				fontSize: "0.85rem",
				alignItems: "center",
				boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
			}}
		>
			<HudChip label="Floor" value={String(state.floor)} />
			<HudChip label="Act" value={String(state.act)} />
			<HpBar current={state.currentHp} max={state.maxHp} />
			<span
				style={{
					color: "var(--accent-gold)",
					fontWeight: "bold",
					display: "flex",
					alignItems: "center",
					gap: "0.25rem",
				}}
			>
				<svg
					width={14}
					height={14}
					viewBox="0 0 24 24"
					fill="currentColor"
					role="img"
					aria-label="Gold"
				>
					<circle cx={12} cy={12} r={10} />
				</svg>
				{state.gold}
			</span>
			<CardPileViewer />
			{state.relics.length > 0 && (
				<span style={{ display: "flex", gap: "0.25rem" }}>
					{state.relics.map((r) => (
						<span
							key={r.id}
							title={`${getRelic(r.id)?.name ?? r.id}: ${getRelic(r.id)?.text ?? ""}`}
							style={{
								padding: "0.125rem 0.5rem",
								background: "rgba(127,90,240,0.15)",
								border: "1px solid var(--border)",
								borderRadius: 10,
								fontSize: "0.75rem",
								cursor: "help",
								color: "var(--text)",
							}}
						>
							{getRelic(r.id)?.name ?? r.id}
						</span>
					))}
				</span>
			)}
			<PotionSlots />
		</div>
	);
}

function HudChip({ label, value }: { label: string; value: string }) {
	return (
		<span
			style={{
				display: "flex",
				alignItems: "center",
				gap: "0.25rem",
			}}
		>
			<span style={{ color: "var(--text-dim)", fontSize: "0.75rem" }}>{label}</span>
			<span style={{ fontWeight: "bold" }}>{value}</span>
		</span>
	);
}

function PotionSlots() {
	const state = useGameStore((s) => s.state);
	const dispatch = useGameStore((s) => s.dispatch);
	if (!state) return null;

	return (
		<span style={{ display: "flex", gap: "0.25rem" }}>
			{state.potions.map((p, i) => {
				const def = p ? getPotion(p) : null;
				const slotKey = `potion-${i}-${p ?? "empty"}`;
				if (!p) {
					return (
						<span
							key={slotKey}
							style={{
								padding: "0.125rem 0.5rem",
								background: "var(--bg-card)",
								border: "1px dashed var(--border)",
								borderRadius: 10,
								fontSize: "0.75rem",
								color: "var(--text-dim)",
							}}
						>
							Empty
						</span>
					);
				}
				return (
					<button
						type="button"
						key={slotKey}
						title={`${def?.name}: ${def?.text}. Right-click to discard.`}
						onClick={() => {
							if (state.combat) {
								dispatch({ type: "usePotion", index: i, targetIndex: 0 });
							}
						}}
						onContextMenu={(e) => {
							e.preventDefault();
							dispatch({ type: "discardPotion", index: i });
						}}
						style={{
							padding: "0.125rem 0.5rem",
							background: "linear-gradient(135deg, #7f5af0, #663399)",
							border: "1px solid var(--accent-blue)",
							borderRadius: 10,
							fontSize: "0.75rem",
							color: "#fff",
							cursor: "pointer",
							boxShadow: "0 1px 4px rgba(127,90,240,0.3)",
						}}
					>
						{def?.name ?? p}
					</button>
				);
			})}
		</span>
	);
}

function HpBar({ current, max }: { current: number; max: number }) {
	const pct = Math.max(0, (current / max) * 100);
	return (
		<div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
			<div
				style={{
					width: 110,
					height: 12,
					background: "var(--hp-bg)",
					borderRadius: 6,
					overflow: "hidden",
					boxShadow: "inset 0 1px 3px rgba(0,0,0,0.4)",
				}}
			>
				<div
					style={{
						width: `${pct}%`,
						height: "100%",
						background: "linear-gradient(90deg, var(--hp-bar), #ff6b6b)",
						borderRadius: 6,
						transition: "width 0.3s",
					}}
				/>
			</div>
			<span style={{ fontWeight: 600, fontSize: "0.85rem" }}>
				{current}/{max}
			</span>
		</div>
	);
}
