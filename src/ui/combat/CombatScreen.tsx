import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { getCard } from "../../engine/content/loader";
import type { CardInstance, StanceId } from "../../engine/core/types";
import { tCard, tCardText, tUi } from "../../i18n";
import { useGameStore } from "../../store/gameStore";
import { cardTypeLabel, formatCardText } from "../cardTextUtils";
import { FloatLayer, useFloatingTexts } from "./CombatAnimations";
import { BlockBadge, EnergyOrb, HpBar, PowerList } from "./CombatWidgets";
import { MonsterView } from "./MonsterView";
import { OrbSlots } from "./OrbSlots";

export function CombatScreen() {
	const state = useGameStore((s) => s.state);
	const dispatch = useGameStore((s) => s.dispatch);
	const [selectedCard, setSelectedCard] = useState<number | null>(null);
	const { playerFloats, monsterFloats } = useFloatingTexts();
	const combat = state?.combat;
	if (!state || !combat) return null;

	const needsTarget = selectedCard !== null;
	const card = selectedCard !== null ? combat.hand[selectedCard] : null;
	const cardDef = card ? getCard(card.id) : null;
	const isTargeted = cardDef?.target === "enemy" || cardDef?.target === "selfandenemy";

	function handlePlayCard(targetIndex: number) {
		if (selectedCard === null) return;
		dispatch({ type: "playCard", handIndex: selectedCard, targetIndex });
		setSelectedCard(null);
	}

	function handleCardClick(idx: number) {
		const c = combat?.hand[idx];
		if (!c) return;
		const def = getCard(c.id);
		if (!def) return;
		if (
			def.target === "self" ||
			def.target === "none" ||
			def.target === "all" ||
			def.target === "allenemy"
		) {
			dispatch({ type: "playCard", handIndex: idx, targetIndex: 0 });
			setSelectedCard(null);
		} else {
			setSelectedCard(selectedCard === idx ? null : idx);
		}
	}

	const hasOrbs = combat.player.orbSlots > 0;

	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				height: "calc(100vh - var(--hud-height))",
				background: "radial-gradient(ellipse at 50% 30%, rgba(108,92,231,0.06), transparent 60%)",
			}}
		>
			{/* Battlefield — player vs monsters */}
			<div
				style={{
					flex: 1,
					display: "flex",
					justifyContent: "space-between",
					alignItems: "center",
					padding: "1rem 2rem",
					minHeight: 0,
				}}
			>
				<PlayerAvatar
					character={state.character}
					hp={state.currentHp}
					maxHp={state.maxHp}
					block={combat.player.block}
					stance={combat.player.stance}
					powers={combat.player.powers}
					floats={playerFloats}
				/>
				<div style={{ display: "flex", gap: "1.5rem", alignItems: "center" }}>
					<AnimatePresence>
						{combat.monsters.map((m, i) => (
							<MonsterView
								key={m.index}
								monster={m}
								floats={monsterFloats(m.index)}
								onClick={() => needsTarget && isTargeted && handlePlayCard(i)}
								highlighted={needsTarget && isTargeted}
							/>
						))}
					</AnimatePresence>
				</div>
			</div>

			{/* Player status bar */}
			<div
				style={{
					display: "flex",
					justifyContent: "center",
					alignItems: "center",
					gap: "1rem",
					padding: "0.5rem 1rem",
					background: "linear-gradient(180deg, transparent, var(--bg-panel))",
					position: "relative",
				}}
			>
				<EnergyOrb current={combat.energy} max={combat.maxEnergy} />

				{hasOrbs && <OrbSlots orbs={combat.player.orbs} slots={combat.player.orbSlots} />}

				<div
					style={{
						display: "flex",
						flexDirection: "column",
						alignItems: "center",
						gap: "0.125rem",
						fontSize: "0.75rem",
						color: "var(--text-dim)",
					}}
				>
					<span>
						{tUi("draw")} {combat.drawPile.length}
					</span>
					<span>
						{tUi("discard")} {combat.discardPile.length}
					</span>
					{combat.exhaustPile.length > 0 && (
						<span>
							{tUi("exhaust")} {combat.exhaustPile.length}
						</span>
					)}
				</div>

				<motion.button
					type="button"
					onClick={() => dispatch({ type: "endTurn" })}
					whileHover={{ scale: 1.05 }}
					whileTap={{ scale: 0.95 }}
					style={{
						background: "linear-gradient(135deg, var(--accent), #ff6b8a)",
						color: "#fff",
						border: "none",
						padding: "0.5rem 1.5rem",
						fontWeight: 700,
						fontSize: "0.9rem",
						borderRadius: 10,
						boxShadow: "0 2px 12px rgba(255,60,111,0.4)",
						letterSpacing: "0.02em",
					}}
				>
					{tUi("endTurn")}
				</motion.button>
			</div>

			{/* Hand */}
			<div
				style={{
					display: "flex",
					justifyContent: "center",
					padding: "0.5rem 1rem 1rem",
					background: "var(--bg-panel)",
					borderTop: "1px solid var(--border)",
					minHeight: "var(--hand-height)",
					alignItems: "flex-end",
					perspective: "1200px",
				}}
			>
				<AnimatePresence>
					{combat.hand.map((c, i) => {
						const count = combat.hand.length;
						const mid = (count - 1) / 2;
						const offset = i - mid;
						const maxAngle = Math.min(5, 25 / Math.max(count, 1));
						const angle = offset * maxAngle;
						const lift = -Math.abs(offset) * 4;
						return (
							<CardView
								key={c.uniqueId}
								card={c}
								selected={selectedCard === i}
								playable={(c.freeToPlay || c.costForTurn <= combat.energy) && c.costForTurn >= 0}
								onClick={() => handleCardClick(i)}
								angle={angle}
								lift={lift}
								index={i}
								isSelected={selectedCard === i}
								zIndex={selectedCard === i ? 50 : i}
							/>
						);
					})}
				</AnimatePresence>
			</div>
		</div>
	);
}

const stanceStyles: Record<StanceId, { color: string; label: string; glow: string }> = {
	neutral: { color: "var(--text-dim)", label: "", glow: "transparent" },
	wrath: { color: "#ff4444", label: "怒", glow: "rgba(255,68,68,0.5)" },
	calm: { color: "#44aaff", label: "静", glow: "rgba(68,170,255,0.5)" },
	divinity: { color: "#ffcc00", label: "神", glow: "rgba(255,204,0,0.6)" },
};

const charColors: Record<string, string> = {
	IRONCLAD: "var(--ironclad)",
	SILENT: "var(--silent)",
	DEFECT: "var(--defect)",
	WATCHER: "var(--watcher)",
};

const charImages: Record<string, string> = {
	IRONCLAD: "characters/ironclad.png",
	SILENT: "characters/silent.png",
	DEFECT: "characters/defect.png",
	WATCHER: "characters/watcher.png",
};

function PlayerAvatar({
	character,
	hp,
	maxHp,
	block,
	stance,
	powers,
	floats,
}: {
	character: string;
	hp: number;
	maxHp: number;
	block: number;
	stance: StanceId;
	powers: import("../../engine/core/types").PowerInstance[];
	floats: import("./CombatAnimations").FloatingText[];
}) {
	const color = charColors[character] ?? "var(--text)";
	const si = stanceStyles[stance];
	const active = stance !== "neutral";

	return (
		<motion.div
			initial={{ opacity: 0, x: -30 }}
			animate={{ opacity: 1, x: 0 }}
			style={{
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				gap: "0.5rem",
				position: "relative",
			}}
		>
			<FloatLayer items={floats} />

			{active && (
				<motion.div
					initial={{ opacity: 0, scale: 0.8 }}
					animate={{ opacity: 1, scale: 1 }}
					style={{
						position: "absolute",
						top: -16,
						padding: "2px 10px",
						borderRadius: 8,
						background: `${si.color}22`,
						border: `1px solid ${si.color}66`,
						fontSize: "0.75rem",
						fontWeight: 700,
						color: si.color,
						letterSpacing: "0.1em",
						zIndex: 2,
					}}
				>
					{si.label}
				</motion.div>
			)}

			<motion.div
				animate={
					active
						? {
								filter: [
									`drop-shadow(0 0 8px ${si.glow})`,
									`drop-shadow(0 0 20px ${si.glow})`,
									`drop-shadow(0 0 8px ${si.glow})`,
								],
							}
						: {}
				}
				transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY }}
				style={{
					filter: active
						? `drop-shadow(0 0 12px ${si.glow})`
						: `drop-shadow(0 4px 8px rgba(0,0,0,0.4))`,
					transition: "filter 0.3s",
				}}
			>
				<img
					src={`${import.meta.env.BASE_URL}${charImages[character] ?? "characters/ironclad.png"}`}
					alt={character}
					style={{ width: 180, height: 180, objectFit: "contain", imageRendering: "auto" }}
				/>
			</motion.div>

			<div style={{ fontWeight: 700, fontSize: "0.85rem", color, letterSpacing: "0.03em" }}>
				{tUi(
					(character.toLowerCase() as "ironclad" | "silent" | "defect" | "watcher") ?? "ironclad",
				)}
			</div>

			<HpBar current={hp} max={maxHp} />

			{block > 0 && <BlockBadge value={block} />}

			{powers.length > 0 && <PowerList powers={powers} />}
		</motion.div>
	);
}

function CardView({
	card,
	selected,
	playable,
	onClick,
	angle,
	lift,
	index,
	isSelected,
	zIndex,
}: {
	card: CardInstance;
	selected: boolean;
	playable: boolean;
	onClick: () => void;
	angle: number;
	lift: number;
	index: number;
	isSelected: boolean;
	zIndex: number;
}) {
	const def = getCard(card.id);
	const name = tCard(card.id, def?.name ?? card.id);
	const cost = card.freeToPlay ? 0 : card.costForTurn;
	const rawText = tCardText(card.id, def?.text ?? "");
	const desc = formatCardText(rawText, card, def);

	const typeColor =
		def?.type === "attack"
			? "var(--card-attack)"
			: def?.type === "skill"
				? "var(--card-skill)"
				: def?.type === "power"
					? "var(--card-power)"
					: "var(--text-dim)";

	const borderColor = selected ? "var(--accent)" : playable ? typeColor : "var(--border)";

	return (
		<motion.button
			type="button"
			onClick={onClick}
			disabled={!playable}
			initial={{ opacity: 0, y: 60, scale: 0.8 }}
			animate={{
				opacity: 1,
				y: isSelected ? lift - 20 : lift,
				scale: isSelected ? 1.1 : 1,
				rotate: isSelected ? 0 : angle,
			}}
			exit={{ opacity: 0, y: 40, scale: 0.8 }}
			transition={{ type: "spring", stiffness: 300, damping: 25, delay: index * 0.03 }}
			whileHover={playable ? { y: lift - 16, scale: 1.08 } : {}}
			style={{
				padding: 0,
				background: "var(--bg-card)",
				border: `2px solid ${borderColor}`,
				borderRadius: 10,
				width: 136,
				textAlign: "center",
				overflow: "hidden",
				boxShadow: selected
					? `0 8px 24px rgba(255,60,111,0.3), 0 0 0 1px ${borderColor}`
					: playable
						? `0 4px 16px rgba(0,0,0,0.5), 0 0 0 1px ${typeColor}33`
						: "var(--shadow-md)",
				transformOrigin: "bottom center",
				marginLeft: index === 0 ? 0 : -8,
				zIndex,
				cursor: playable ? "pointer" : "default",
			}}
		>
			{/* Type banner */}
			<div
				style={{
					height: 36,
					background: `linear-gradient(135deg, ${typeColor}33, ${typeColor}11)`,
					borderBottom: `1px solid ${typeColor}44`,
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					padding: "0 0.5rem",
				}}
			>
				<span
					style={{
						fontSize: "0.9rem",
						color: "var(--energy)",
						fontWeight: 800,
						background: "rgba(0,0,0,0.6)",
						borderRadius: "50%",
						width: 24,
						height: 24,
						display: "inline-flex",
						alignItems: "center",
						justifyContent: "center",
						boxShadow: "0 0 8px var(--energy-glow)",
					}}
				>
					{cost >= 0 ? cost : "X"}
				</span>
				<span
					style={{
						fontSize: "0.55rem",
						color: typeColor,
						textTransform: "uppercase",
						fontWeight: 700,
						letterSpacing: "0.08em",
					}}
				>
					{cardTypeLabel(def?.type)}
				</span>
			</div>
			{/* Body */}
			<div style={{ padding: "0.375rem 0.5rem 0.5rem" }}>
				<div
					style={{
						fontSize: "0.8rem",
						fontWeight: 700,
						marginBottom: "0.25rem",
						color: "var(--text-bright)",
					}}
				>
					{name}
					{card.upgraded ? "+" : ""}
				</div>
				<div
					style={{
						fontSize: "0.6rem",
						color: "var(--text-dim)",
						lineHeight: 1.5,
						minHeight: "2.4em",
					}}
				>
					{desc}
				</div>
			</div>
		</motion.button>
	);
}
