import { motion } from "framer-motion";
import { useState } from "react";
import { getCard } from "../../engine/content/loader";
import {
	potionSelectLimits,
	potionSelectSource,
	STANCE_CHOICES,
} from "../../engine/core/potionSelect";
import type { CardInstance, CardSelectTask } from "../../engine/core/types";
import { tCard, tCardSelect } from "../../i18n";
import { useGameStore } from "../../store/gameStore";
import { cardTypeLabel } from "../cardTextUtils";

const overlayStyle = {
	position: "fixed" as const,
	inset: 0,
	background: "rgba(0,0,0,0.5)",
	display: "flex" as const,
	flexDirection: "column" as const,
	alignItems: "center" as const,
	justifyContent: "center" as const,
	gap: "1.25rem",
	padding: "1rem",
	zIndex: 60,
};

const panelStyle = {
	background: "var(--bg-glass)",
	backdropFilter: "blur(12px)",
	WebkitBackdropFilter: "blur(12px)",
	border: "1px solid var(--border)",
	borderRadius: 16,
	padding: "2rem 2.5rem",
	boxShadow: "var(--shadow-lg), var(--shadow-glow)",
	display: "flex" as const,
	flexDirection: "column" as const,
	alignItems: "center" as const,
	gap: "1.25rem",
	maxWidth: 720,
	width: "90vw",
};

function cardTypeColor(type?: string): string {
	switch (type) {
		case "attack":
			return "var(--card-attack)";
		case "skill":
			return "var(--card-skill)";
		case "power":
			return "var(--card-power)";
		default:
			return "var(--text-dim)";
	}
}

export function CardSelectScreen() {
	const state = useGameStore((s) => s.state);
	const dispatch = useGameStore((s) => s.dispatch);
	const [picked, setPicked] = useState<number[]>([]);

	if (state?.phase.type !== "cardSelect") return null;

	const { task, options } = state.phase;
	const combat = state.combat;
	if (!combat) return null;

	const cards: CardInstance[] =
		options ?? potionSelectSource(task, combat) ?? getSourceCards(task, combat);
	const label = tCardSelect(task);
	// Multi-select (Elixir, Gambler's Brew / Gambling Chip, Liquid Memories): toggle, then confirm.
	const limits = potionSelectLimits(state, task, cards.length);
	const choose = (i: number) => {
		if (!limits) {
			dispatch({ type: "chooseCard", indices: [i] });
			return;
		}
		setPicked((p) =>
			p.includes(i) ? p.filter((x) => x !== i) : p.length < limits.max ? [...p, i] : p,
		);
	};
	const confirm = () => {
		dispatch({ type: "chooseCard", indices: picked });
		setPicked([]);
	};
	const canConfirm = !!limits && picked.length >= limits.min && picked.length <= limits.max;

	return (
		<div style={overlayStyle}>
			<motion.div
				style={panelStyle}
				initial={{ opacity: 0, y: 24, scale: 0.96 }}
				animate={{ opacity: 1, y: 0, scale: 1 }}
				transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
			>
				{/* Title */}
				<motion.h2
					style={{
						fontSize: "1.2rem",
						fontWeight: 700,
						color: "var(--accent-cyan)",
						letterSpacing: "0.03em",
						textShadow: "0 0 10px rgba(0,212,255,0.25)",
					}}
					initial={{ opacity: 0, y: -8 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ delay: 0.1, duration: 0.35 }}
				>
					{label}
				</motion.h2>

				{/* Card grid */}
				<div
					style={{
						display: "flex",
						gap: "0.6rem",
						flexWrap: "wrap",
						justifyContent: "center",
						maxWidth: 650,
					}}
				>
					{cards.map((card, i) => {
						const def = getCard(card.id);
						const name =
							card.id in STANCE_CHOICES
								? tCardSelect(card.id)
								: tCard(card.id, def?.name ?? card.id);
						const isPicked = picked.includes(i);
						const cost = card.freeToPlay ? 0 : card.costForTurn;
						const typeColor = cardTypeColor(def?.type);

						return (
							<motion.button
								type="button"
								key={card.uniqueId}
								onClick={() => choose(i)}
								style={{
									padding: "0.6rem 0.85rem",
									border: isPicked ? `2px solid var(--accent-cyan)` : `1px solid var(--border)`,
									borderRadius: 10,
									minWidth: 110,
									textAlign: "center",
									background: "var(--bg-card)",
									boxShadow: "var(--shadow-sm)",
									display: "flex",
									flexDirection: "column",
									alignItems: "center",
									gap: "0.2rem",
								}}
								initial={{ opacity: 0, y: 20, scale: 0.9 }}
								animate={{ opacity: 1, y: 0, scale: 1 }}
								transition={{
									delay: 0.15 + i * 0.04,
									duration: 0.35,
									ease: [0.16, 1, 0.3, 1],
								}}
								whileHover={{
									scale: 1.07,
									borderColor: typeColor,
									boxShadow: `0 2px 16px rgba(0,0,0,0.5), 0 0 12px ${typeColor}30`,
								}}
								whileTap={{ scale: 0.95 }}
							>
								{/* Cost */}
								<div
									style={{
										fontSize: "0.7rem",
										fontWeight: 700,
										color: "var(--energy)",
										textShadow: "0 0 5px var(--energy-glow)",
									}}
								>
									{cost >= 0 ? cost : ""}
								</div>

								{/* Name */}
								<div
									style={{
										fontWeight: 700,
										fontSize: "0.8rem",
										color: "var(--text-bright)",
									}}
								>
									{name}
									{card.upgraded ? "+" : ""}
								</div>

								{/* Type badge */}
								<div
									style={{
										fontSize: "0.6rem",
										color: typeColor,
										fontWeight: 600,
										padding: "1px 6px",
										borderRadius: 6,
										background: `${typeColor}12`,
									}}
								>
									{cardTypeLabel(def?.type)}
								</div>
							</motion.button>
						);
					})}
				</div>
				{limits && (
					<button
						type="button"
						onClick={confirm}
						disabled={!canConfirm}
						style={{
							padding: "0.5rem 1.5rem",
							borderRadius: 10,
							border: "1px solid var(--accent-cyan)",
							background: "var(--bg-card)",
							color: "var(--text-bright)",
							opacity: canConfirm ? 1 : 0.4,
							cursor: canConfirm ? "pointer" : "default",
						}}
					>
						{tCardSelect("confirm")} ({picked.length})
					</button>
				)}
			</motion.div>
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
