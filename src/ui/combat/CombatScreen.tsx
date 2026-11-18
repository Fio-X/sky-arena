import { useState } from "react";
import { getCard } from "../../engine/content/loader";
import type { CardInstance, MonsterState } from "../../engine/core/types";
import { useGameStore } from "../../store/gameStore";

export function CombatScreen() {
	const state = useGameStore((s) => s.state);
	const dispatch = useGameStore((s) => s.dispatch);
	const [selectedCard, setSelectedCard] = useState<number | null>(null);
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

	return (
		<div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 36px)" }}>
			{/* Monsters */}
			<div
				style={{
					flex: 1,
					display: "flex",
					justifyContent: "center",
					alignItems: "center",
					gap: "2rem",
					padding: "1rem",
				}}
			>
				{combat.monsters.map((m, i) => (
					<MonsterCard
						key={m.index}
						monster={m}
						onClick={() => needsTarget && isTargeted && handlePlayCard(i)}
						highlighted={needsTarget && isTargeted}
					/>
				))}
			</div>

			{/* Player info */}
			<div
				style={{
					display: "flex",
					justifyContent: "center",
					gap: "2rem",
					padding: "0.5rem",
					background: "var(--bg-panel)",
					borderTop: "1px solid var(--border)",
					alignItems: "center",
				}}
			>
				<span>Block: {combat.player.block}</span>
				<span style={{ color: "var(--energy)", fontWeight: "bold", fontSize: "1.1rem" }}>
					Energy: {combat.energy}/{combat.maxEnergy}
				</span>
				<span style={{ color: "var(--text-dim)" }}>
					Draw: {combat.drawPile.length} | Discard: {combat.discardPile.length}
				</span>
				<button type="button" onClick={() => dispatch({ type: "endTurn" })}>
					End Turn
				</button>
			</div>

			{/* Hand */}
			<div
				style={{
					display: "flex",
					justifyContent: "center",
					gap: "0.5rem",
					padding: "0.75rem",
					background: "var(--bg-panel)",
					flexWrap: "wrap",
				}}
			>
				{combat.hand.map((c, i) => (
					<CardView
						key={c.uniqueId}
						card={c}
						selected={selectedCard === i}
						playable={c.costForTurn >= 0 && c.costForTurn <= combat.energy}
						onClick={() => handleCardClick(i)}
					/>
				))}
			</div>
		</div>
	);
}

function MonsterCard({
	monster,
	onClick,
	highlighted,
}: {
	monster: MonsterState;
	onClick: () => void;
	highlighted: boolean;
}) {
	if (!monster.alive) return null;

	const intentLabel = monster.intent.isAttack
		? `ATK ${monster.intent.baseDamage ?? "?"}${monster.intent.hits > 1 ? `×${monster.intent.hits}` : ""}`
		: monster.intent.isBuff
			? "BUFF"
			: monster.intent.isDebuff
				? "DEBUFF"
				: "???";

	return (
		<button
			type="button"
			onClick={onClick}
			style={{
				padding: "1rem",
				background: "var(--bg-card)",
				border: `2px solid ${highlighted ? "var(--accent)" : "var(--border)"}`,
				borderRadius: 8,
				textAlign: "center",
				minWidth: 120,
				cursor: highlighted ? "pointer" : "default",
				transition: "border-color 0.15s",
			}}
		>
			<div style={{ fontSize: "0.75rem", color: "var(--accent)", marginBottom: "0.25rem" }}>
				{intentLabel}
			</div>
			<div style={{ fontWeight: "bold", marginBottom: "0.5rem" }}>
				{monster.id.replace(/_/g, " ")}
			</div>
			<HpBarSmall current={monster.currentHp} max={monster.maxHp} />
			{monster.block > 0 && (
				<div style={{ fontSize: "0.75rem", color: "var(--accent-blue)", marginTop: "0.25rem" }}>
					Block: {monster.block}
				</div>
			)}
			{monster.powers.length > 0 && (
				<div style={{ fontSize: "0.7rem", color: "var(--text-dim)", marginTop: "0.25rem" }}>
					{monster.powers.map((p) => `${p.id}(${p.amount})`).join(", ")}
				</div>
			)}
		</button>
	);
}

function HpBarSmall({ current, max }: { current: number; max: number }) {
	const pct = Math.max(0, (current / max) * 100);
	return (
		<div
			style={{ display: "flex", alignItems: "center", gap: "0.25rem", justifyContent: "center" }}
		>
			<div
				style={{
					width: 80,
					height: 8,
					background: "var(--hp-bg)",
					borderRadius: 2,
					overflow: "hidden",
				}}
			>
				<div style={{ width: `${pct}%`, height: "100%", background: "var(--hp-bar)" }} />
			</div>
			<span style={{ fontSize: "0.75rem" }}>
				{current}/{max}
			</span>
		</div>
	);
}

function CardView({
	card,
	selected,
	playable,
	onClick,
}: {
	card: CardInstance;
	selected: boolean;
	playable: boolean;
	onClick: () => void;
}) {
	const def = getCard(card.id);
	const name = def?.name ?? card.id;
	const cost = card.freeToPlay ? 0 : card.costForTurn;

	const rarityColor =
		def?.rarity === "rare"
			? "var(--rare)"
			: def?.rarity === "uncommon"
				? "var(--uncommon)"
				: "var(--common)";

	return (
		<button
			type="button"
			onClick={onClick}
			disabled={!playable}
			style={{
				padding: "0.5rem 0.75rem",
				background: selected ? "var(--bg-card)" : "var(--bg-panel)",
				border: `2px solid ${selected ? "var(--accent)" : playable ? rarityColor : "var(--border)"}`,
				borderRadius: 6,
				minWidth: 90,
				transform: selected ? "translateY(-8px)" : "none",
				transition: "transform 0.15s, border-color 0.15s",
			}}
		>
			<div style={{ fontSize: "0.7rem", color: "var(--energy)" }}>{cost}</div>
			<div style={{ fontSize: "0.8rem", fontWeight: "bold" }}>{name}</div>
			<div style={{ fontSize: "0.65rem", color: "var(--text-dim)" }}>
				{def?.type ?? ""}
				{card.upgraded ? "+" : ""}
			</div>
		</button>
	);
}
