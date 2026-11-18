import { useState } from "react";
import { getCard } from "../../engine/content/loader";
import { useGameStore } from "../../store/gameStore";

export function RestScreen() {
	const state = useGameStore((s) => s.state);
	const dispatch = useGameStore((s) => s.dispatch);
	const [mode, setMode] = useState<"choose" | "smith">("choose");

	if (!state) return null;

	const healAmount = Math.floor(state.maxHp * 0.3);
	const upgradable = state.deck
		.map((c, i) => ({ card: c, index: i }))
		.filter((e) => !e.card.upgraded);

	if (mode === "smith") {
		return (
			<div
				style={{
					height: "calc(100vh - 36px)",
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
					justifyContent: "center",
					gap: "1rem",
				}}
			>
				<h2>Smith - Choose a card to upgrade</h2>
				<div
					style={{
						display: "flex",
						gap: "0.5rem",
						flexWrap: "wrap",
						justifyContent: "center",
						maxWidth: 600,
					}}
				>
					{upgradable.map((e) => {
						const def = getCard(e.card.id);
						return (
							<button
								type="button"
								key={e.card.uniqueId}
								onClick={() => dispatch({ type: "smith", cardIndex: e.index })}
								style={{ padding: "0.5rem 0.75rem", minWidth: 80 }}
							>
								{def?.name ?? e.card.id}
							</button>
						);
					})}
				</div>
				<button type="button" onClick={() => setMode("choose")} style={{ marginTop: "1rem" }}>
					Back
				</button>
			</div>
		);
	}

	return (
		<div
			style={{
				height: "calc(100vh - 36px)",
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				justifyContent: "center",
				gap: "1rem",
			}}
		>
			<h2>Rest Site</h2>
			<button type="button" onClick={() => dispatch({ type: "rest" })}>
				Rest (heal {healAmount} HP)
			</button>
			<button type="button" onClick={() => setMode("smith")} disabled={upgradable.length === 0}>
				Smith (upgrade a card)
			</button>
		</div>
	);
}
