import { getCard, getPotion } from "../../engine/content/loader";
import { useGameStore } from "../../store/gameStore";

export function RewardScreen() {
	const state = useGameStore((s) => s.state);
	const dispatch = useGameStore((s) => s.dispatch);
	if (state?.phase.type !== "reward") return null;

	const { cardRewards, potionReward, gold } = state.phase;

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
			<h2>Victory!</h2>

			{gold > 0 && <p style={{ color: "var(--accent-gold)" }}>+{gold} Gold</p>}

			{potionReward && (
				<button
					type="button"
					onClick={() => dispatch({ type: "obtainPotionReward" })}
					style={{
						padding: "0.75rem 1.5rem",
						background: "var(--accent-potion, #663399)",
						color: "#fff",
						border: "2px solid var(--border)",
						borderRadius: 8,
					}}
				>
					Take {getPotion(potionReward)?.name ?? potionReward}
				</button>
			)}

			{cardRewards.length > 0 && (
				<>
					<p style={{ color: "var(--text-dim)" }}>Choose a card to add to your deck:</p>
					<div style={{ display: "flex", gap: "1rem" }}>
						{cardRewards.map((cardId, i) => {
							const def = getCard(cardId);
							const name = def?.name ?? cardId;
							const rarityColor =
								def?.rarity === "rare"
									? "var(--rare)"
									: def?.rarity === "uncommon"
										? "var(--uncommon)"
										: "var(--common)";
							return (
								<button
									type="button"
									key={cardId}
									onClick={() => dispatch({ type: "chooseCardReward", index: i })}
									style={{
										padding: "1rem 1.5rem",
										border: `2px solid ${rarityColor}`,
										borderRadius: 8,
										minWidth: 120,
										textAlign: "center",
									}}
								>
									<div style={{ fontSize: "0.75rem", color: "var(--energy)" }}>
										{def?.cost ?? "?"}
									</div>
									<div style={{ fontWeight: "bold", marginBottom: "0.25rem" }}>{name}</div>
									<div
										style={{
											fontSize: "0.65rem",
											color: "var(--text-dim)",
											marginBottom: "0.25rem",
										}}
									>
										{def?.rarity} {def?.type}
									</div>
									{def?.text && (
										<div style={{ fontSize: "0.6rem", color: "var(--text-dim)", lineHeight: 1.3 }}>
											{def.text
												.replace(/\[(\d+)\|(\d+)]/g, (_m: string, base: string) => base)
												.replace(/\{\{QueryLink\|[^|]*\|[^|]*\|([^}]*)}}/g, "$1")
												.replace(/<br\s*\/?>/g, " ")
												.replace(/\$/g, "")}
										</div>
									)}
								</button>
							);
						})}
					</div>
				</>
			)}

			<button
				type="button"
				onClick={() => {
					if (cardRewards.length > 0) {
						dispatch({ type: "skipCardReward" });
					} else {
						dispatch({ type: "proceed" });
					}
				}}
				style={{ padding: "0.75rem 2rem" }}
			>
				{cardRewards.length > 0 ? "Skip" : "Continue"}
			</button>
		</div>
	);
}
