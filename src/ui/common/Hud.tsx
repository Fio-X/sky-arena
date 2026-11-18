import { getPotion, getRelic } from "../../engine/content/loader";
import { useGameStore } from "../../store/gameStore";

export function Hud() {
	const state = useGameStore((s) => s.state);
	if (!state) return null;

	return (
		<div
			style={{
				display: "flex",
				gap: "1.5rem",
				padding: "0.5rem 1rem",
				background: "var(--bg-panel)",
				borderBottom: "1px solid var(--border)",
				fontSize: "0.875rem",
				alignItems: "center",
			}}
		>
			<span>Floor {state.floor}</span>
			<span>Act {state.act}</span>
			<HpBar current={state.currentHp} max={state.maxHp} />
			<span style={{ color: "var(--accent-gold)" }}>Gold: {state.gold}</span>
			<span style={{ color: "var(--text-dim)" }}>Deck: {state.deck.length}</span>
			{state.relics.length > 0 && (
				<span style={{ display: "flex", gap: "0.25rem", color: "var(--text-dim)" }}>
					{state.relics.map((r) => (
						<span
							key={r.id}
							title={`${getRelic(r.id)?.name ?? r.id}: ${getRelic(r.id)?.text ?? ""}`}
							style={{
								padding: "0 0.375rem",
								background: "var(--bg-card)",
								border: "1px solid var(--border)",
								borderRadius: 4,
								fontSize: "0.75rem",
								cursor: "help",
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
								padding: "0 0.375rem",
								background: "var(--bg-card)",
								border: "1px solid var(--border)",
								borderRadius: 4,
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
							padding: "0 0.375rem",
							background: "var(--accent-potion, #663399)",
							border: "1px solid var(--border)",
							borderRadius: 4,
							fontSize: "0.75rem",
							color: "#fff",
							cursor: "pointer",
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
		<div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
			<div
				style={{
					width: 100,
					height: 12,
					background: "var(--hp-bg)",
					borderRadius: 2,
					overflow: "hidden",
				}}
			>
				<div
					style={{
						width: `${pct}%`,
						height: "100%",
						background: "var(--hp-bar)",
						transition: "width 0.3s",
					}}
				/>
			</div>
			<span>
				{current}/{max}
			</span>
		</div>
	);
}
