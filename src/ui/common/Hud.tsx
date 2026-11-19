import { getPotion, getRelic } from "../../engine/content/loader";
import { tPotion, tRelic, tUi } from "../../i18n";
import { useGameStore } from "../../store/gameStore";
import { CardPileViewer } from "./CardPileViewer";
import { LanguageToggle } from "./LanguageToggle";

export function Hud() {
	const state = useGameStore((s) => s.state);
	if (!state) return null;

	return (
		<div style={{
			display: "flex",
			gap: "0.75rem",
			padding: "0 1rem",
			height: "var(--hud-height)",
			background: "var(--bg-panel)",
			borderBottom: "1px solid var(--border)",
			fontSize: "0.8rem",
			alignItems: "center",
			boxShadow: "0 2px 12px rgba(0,0,0,0.4)",
			backdropFilter: "blur(8px)",
			zIndex: 100,
		}}>
			<HudChip label={tUi("floor")} value={String(state.floor)} color="var(--text)" />
			<HudChip label={tUi("act")} value={String(state.act)} color="var(--text)" />
			<HpBar current={state.currentHp} max={state.maxHp} />

			<span style={{
				color: "var(--accent-gold)",
				fontWeight: 700,
				display: "flex",
				alignItems: "center",
				gap: "0.2rem",
				fontSize: "0.85rem",
			}}>
				<svg width={12} height={12} viewBox="0 0 24 24" fill="currentColor">
					<circle cx={12} cy={12} r={10} />
				</svg>
				{state.gold}
			</span>

			<CardPileViewer />

			{state.relics.length > 0 && (
				<span style={{ display: "flex", gap: "0.25rem", flexShrink: 0 }}>
					{state.relics.map((r) => {
						const def = getRelic(r.id);
						return (
							<span
								key={r.id}
								title={`${tRelic(r.id, def?.name ?? r.id)}: ${def?.text ?? ""}`}
								style={{
									padding: "2px 8px",
									background: "rgba(108,92,231,0.12)",
									border: "1px solid var(--border)",
									borderRadius: 12,
									fontSize: "0.7rem",
									cursor: "help",
									color: "var(--text)",
									backdropFilter: "blur(4px)",
								}}
							>
								{tRelic(r.id, def?.name ?? r.id)}
							</span>
						);
					})}
				</span>
			)}

			<PotionSlots />

			<div style={{ marginLeft: "auto" }}>
				<LanguageToggle />
			</div>
		</div>
	);
}

function HudChip({ label, value, color }: { label: string; value: string; color: string }) {
	return (
		<span style={{ display: "flex", alignItems: "center", gap: "0.2rem" }}>
			<span style={{ color: "var(--text-dim)", fontSize: "0.7rem", fontWeight: 500 }}>
				{label}
			</span>
			<span style={{ fontWeight: 700, color, fontSize: "0.85rem" }}>{value}</span>
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
								padding: "2px 8px",
								background: "rgba(255,255,255,0.03)",
								border: "1px dashed var(--border)",
								borderRadius: 12,
								fontSize: "0.7rem",
								color: "var(--text-dim)",
							}}
						>
							{tUi("empty")}
						</span>
					);
				}
				return (
					<button
						type="button"
						key={slotKey}
						title={`${tPotion(p, def?.name ?? p)}: ${def?.text ?? ""}`}
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
							padding: "2px 8px",
							background: "linear-gradient(135deg, rgba(108,92,231,0.3), rgba(108,92,231,0.15))",
							border: "1px solid var(--accent-blue)",
							borderRadius: 12,
							fontSize: "0.7rem",
							color: "#fff",
							cursor: "pointer",
							boxShadow: "0 1px 6px rgba(108,92,231,0.25)",
						}}
					>
						{tPotion(p, def?.name ?? p)}
					</button>
				);
			})}
		</span>
	);
}

function HpBar({ current, max }: { current: number; max: number }) {
	const pct = Math.max(0, (current / max) * 100);
	const isLow = pct < 30;
	return (
		<div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
			<div style={{
				width: 100,
				height: 10,
				background: "var(--hp-bg)",
				borderRadius: 5,
				overflow: "hidden",
				boxShadow: "inset 0 1px 3px rgba(0,0,0,0.5)",
			}}>
				<div style={{
					width: `${pct}%`,
					height: "100%",
					background: isLow
						? "linear-gradient(90deg, #ff4444, #ff6666)"
						: "linear-gradient(90deg, #e53170, #ff6b8a)",
					borderRadius: 5,
					transition: "width 0.3s ease-out",
					boxShadow: isLow ? "0 0 6px rgba(255,68,68,0.4)" : "none",
				}} />
			</div>
			<span style={{
				fontWeight: 600,
				fontSize: "0.8rem",
				color: isLow ? "var(--accent)" : "var(--text)",
			}}>
				{current}/{max}
			</span>
		</div>
	);
}
