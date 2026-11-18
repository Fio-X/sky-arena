import { getRelic } from "../../engine/content/loader";
import { useGameStore } from "../../store/gameStore";

export function BossRewardScreen() {
	const state = useGameStore((s) => s.state);
	const dispatch = useGameStore((s) => s.dispatch);

	if (state?.phase.type !== "bossReward") return null;
	const { relics } = state.phase;

	return (
		<div
			style={{
				height: "calc(100vh - 36px)",
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				justifyContent: "center",
				gap: "2rem",
			}}
		>
			<h2>Boss Defeated!</h2>
			<p style={{ color: "var(--text-dim)" }}>Choose a Boss Relic:</p>
			<div style={{ display: "flex", gap: "1rem" }}>
				{relics.map((relicId, i) => {
					const def = getRelic(relicId as string);
					return (
						<button
							type="button"
							key={relicId as string}
							onClick={() => dispatch({ type: "chooseBossRelic", index: i })}
							style={{
								padding: "1.5rem",
								border: "2px solid var(--accent-gold, gold)",
								borderRadius: 12,
								minWidth: 180,
								textAlign: "center",
								background: "var(--bg-card)",
							}}
						>
							<div style={{ fontWeight: "bold", fontSize: "1.1rem", marginBottom: "0.5rem" }}>
								{def?.name ?? (relicId as string)}
							</div>
							<div style={{ fontSize: "0.8rem", color: "var(--text-dim)" }}>{def?.text ?? ""}</div>
						</button>
					);
				})}
			</div>
		</div>
	);
}
