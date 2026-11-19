import { getCard } from "../../engine/content/loader";
import type { CardInstance, CardSelectTask } from "../../engine/core/types";
import { tCard, tCardSelect } from "../../i18n";
import { useGameStore } from "../../store/gameStore";

export function CardSelectScreen() {
	const state = useGameStore((s) => s.state);
	const dispatch = useGameStore((s) => s.dispatch);

	if (!state || state.phase.type !== "cardSelect") return null;

	const { task, options } = state.phase;
	const combat = state.combat;
	if (!combat) return null;

	const cards: CardInstance[] = options ?? getSourceCards(task, combat);
	const label = tCardSelect(task);

	return (
		<div
			style={{
				height: "calc(100vh - 36px)",
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				justifyContent: "center",
				gap: "1rem",
				padding: "1rem",
			}}
		>
			<h2>{label}</h2>
			<div
				style={{
					display: "flex",
					gap: "0.5rem",
					flexWrap: "wrap",
					justifyContent: "center",
					maxWidth: 700,
				}}
			>
				{cards.map((card, i) => {
					const def = getCard(card.id);
					const name = tCard(card.id, def?.name ?? card.id);
					const cost = card.freeToPlay ? 0 : card.costForTurn;

					return (
						<button
							type="button"
							key={card.uniqueId}
							onClick={() => dispatch({ type: "chooseCard", indices: [i] })}
							style={{
								padding: "0.5rem 0.75rem",
								border: "2px solid var(--border)",
								borderRadius: 6,
								minWidth: 100,
								textAlign: "center",
							}}
						>
							<div style={{ fontSize: "0.7rem", color: "var(--energy)" }}>{cost}</div>
							<div style={{ fontWeight: "bold", fontSize: "0.8rem" }}>
								{name}
								{card.upgraded ? "+" : ""}
							</div>
							<div style={{ fontSize: "0.65rem", color: "var(--text-dim)" }}>{def?.type ?? ""}</div>
						</button>
					);
				})}
			</div>
		</div>
	);
}

function getSourceCards(
	task: CardSelectTask,
	combat: { hand: CardInstance[]; discardPile: CardInstance[]; exhaustPile: CardInstance[] },
): CardInstance[] {
	switch (task) {
		case "headbutt":
		case "hologram":
		case "warcry":
			return combat.discardPile;
		case "exhume":
			return combat.exhaustPile;
		default:
			return combat.hand;
	}
}
