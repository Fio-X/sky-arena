import { useState } from "react";
import { getCard } from "../../engine/content/loader";
import type { CardInstance, MonsterState, PowerInstance } from "../../engine/core/types";
import { useGameStore } from "../../store/gameStore";
import { type FloatingText, FloatLayer, useFloatingTexts } from "./CombatAnimations";

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

	return (
		<div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 36px)" }}>
			{/* Monsters */}
			<div
				style={{
					flex: 1,
					display: "flex",
					justifyContent: "center",
					alignItems: "center",
					gap: "1.5rem",
					padding: "1rem",
				}}
			>
				{combat.monsters.map((m, i) => (
					<MonsterCard
						key={m.index}
						monster={m}
						floats={monsterFloats(m.index)}
						onClick={() => needsTarget && isTargeted && handlePlayCard(i)}
						highlighted={needsTarget && isTargeted}
					/>
				))}
			</div>

			{/* Player bar */}
			<div
				style={{
					display: "flex",
					justifyContent: "center",
					gap: "1.5rem",
					padding: "0.5rem 1rem",
					background: "var(--bg-panel)",
					borderTop: "1px solid var(--border)",
					alignItems: "center",
					position: "relative",
				}}
			>
				<FloatLayer items={playerFloats} />
				{combat.player.block > 0 && (
					<span style={{ color: "var(--accent-blue)" }}>🛡 {combat.player.block}</span>
				)}
				<EnergyOrb current={combat.energy} max={combat.maxEnergy} />
				<span style={{ color: "var(--text-dim)", fontSize: "0.8rem" }}>
					Draw {combat.drawPile.length} · Discard {combat.discardPile.length}
					{combat.exhaustPile.length > 0 && ` · Exhaust ${combat.exhaustPile.length}`}
				</span>
				{combat.player.powers.length > 0 && <PowerList powers={combat.player.powers} />}
				<button type="button" onClick={() => dispatch({ type: "endTurn" })}>
					End Turn
				</button>
			</div>

			{/* Hand */}
			<div
				style={{
					display: "flex",
					justifyContent: "center",
					gap: "0.375rem",
					padding: "0.5rem 0.75rem",
					background: "var(--bg-panel)",
					flexWrap: "wrap",
				}}
			>
				{combat.hand.map((c, i) => (
					<CardView
						key={c.uniqueId}
						card={c}
						selected={selectedCard === i}
						playable={(c.freeToPlay || c.costForTurn <= combat.energy) && c.costForTurn >= 0}
						onClick={() => handleCardClick(i)}
					/>
				))}
			</div>
		</div>
	);
}

function EnergyOrb({ current, max }: { current: number; max: number }) {
	return (
		<div
			style={{
				width: 40,
				height: 40,
				borderRadius: "50%",
				border: "2px solid var(--energy)",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				fontWeight: "bold",
				fontSize: "1rem",
				color: "var(--energy)",
				background: "var(--bg-card)",
				flexShrink: 0,
			}}
		>
			{current}/{max}
		</div>
	);
}

function PowerList({ powers }: { powers: PowerInstance[] }) {
	return (
		<span style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap" }}>
			{powers.map((p) => (
				<span
					key={p.id}
					style={{
						padding: "0 0.375rem",
						background: p.amount > 0 ? "var(--bg-card)" : "var(--accent)",
						border: "1px solid var(--border)",
						borderRadius: 4,
						fontSize: "0.7rem",
						color: p.amount > 0 ? "var(--accent-blue)" : "#fff",
					}}
					title={p.id.replace(/_/g, " ")}
				>
					{p.id.replace(/_/g, " ")} {p.amount}
				</span>
			))}
		</span>
	);
}

function MonsterCard({
	monster,
	floats,
	onClick,
	highlighted,
}: {
	monster: MonsterState;
	floats: FloatingText[];
	onClick: () => void;
	highlighted: boolean;
}) {
	if (!monster.alive) return null;

	return (
		<button
			type="button"
			onClick={onClick}
			style={{
				padding: "0.75rem",
				background: "var(--bg-card)",
				border: `2px solid ${highlighted ? "var(--accent)" : "var(--border)"}`,
				borderRadius: 8,
				textAlign: "center",
				minWidth: 130,
				cursor: highlighted ? "pointer" : "default",
				transition: "border-color 0.15s",
				position: "relative",
			}}
		>
			<FloatLayer items={floats} />
			<IntentDisplay monster={monster} />
			<div style={{ fontWeight: "bold", marginBottom: "0.5rem", fontSize: "0.85rem" }}>
				{monster.id.replace(/_/g, " ")}
			</div>
			<HpBar current={monster.currentHp} max={monster.maxHp} />
			{monster.block > 0 && (
				<div style={{ fontSize: "0.75rem", color: "var(--accent-blue)", marginTop: "0.25rem" }}>
					🛡 {monster.block}
				</div>
			)}
			{monster.powers.length > 0 && (
				<div style={{ marginTop: "0.25rem" }}>
					<PowerList powers={monster.powers} />
				</div>
			)}
		</button>
	);
}

function IntentDisplay({ monster }: { monster: MonsterState }) {
	const { intent } = monster;
	let label: string;
	let color: string;

	if (intent.isAttack) {
		const dmg = intent.baseDamage ?? "?";
		const multi = intent.hits > 1 ? ` ×${intent.hits}` : "";
		label = `⚔ ${dmg}${multi}`;
		color = "var(--accent)";
	} else if (intent.isBuff) {
		label = "↑ Buff";
		color = "var(--accent-gold)";
	} else if (intent.isDebuff) {
		label = "↓ Debuff";
		color = "var(--accent-blue)";
	} else if (intent.isAttack === false && intent.isBuff === false && intent.isDebuff === false) {
		label = "—";
		color = "var(--text-dim)";
	} else {
		label = "?";
		color = "var(--text-dim)";
	}

	return (
		<div style={{ fontSize: "0.75rem", color, marginBottom: "0.375rem", fontWeight: "bold" }}>
			{label}
		</div>
	);
}

function HpBar({ current, max }: { current: number; max: number }) {
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
	const desc = formatCardText(def?.text ?? "", card, def);

	const typeColor =
		def?.type === "attack"
			? "var(--accent)"
			: def?.type === "skill"
				? "var(--accent-blue)"
				: def?.type === "power"
					? "var(--accent-gold)"
					: "var(--text-dim)";

	const rarityBorder =
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
				padding: "0.375rem 0.5rem",
				background: selected ? "var(--bg-card)" : "var(--bg-panel)",
				border: `2px solid ${selected ? "var(--accent)" : playable ? rarityBorder : "var(--border)"}`,
				borderRadius: 6,
				width: 100,
				transform: selected ? "translateY(-8px)" : "none",
				transition: "transform 0.15s, border-color 0.15s",
				textAlign: "center",
			}}
		>
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "center",
					marginBottom: "0.125rem",
				}}
			>
				<span
					style={{
						fontSize: "0.7rem",
						color: "var(--energy)",
						fontWeight: "bold",
						background: "var(--bg-card)",
						borderRadius: "50%",
						width: 18,
						height: 18,
						display: "inline-flex",
						alignItems: "center",
						justifyContent: "center",
					}}
				>
					{cost}
				</span>
				<span style={{ fontSize: "0.6rem", color: typeColor, textTransform: "uppercase" }}>
					{def?.type ?? ""}
				</span>
			</div>
			<div style={{ fontSize: "0.75rem", fontWeight: "bold", marginBottom: "0.125rem" }}>
				{name}
				{card.upgraded ? "+" : ""}
			</div>
			<div
				style={{
					fontSize: "0.6rem",
					color: "var(--text-dim)",
					lineHeight: 1.3,
					minHeight: "1.6em",
				}}
			>
				{desc}
			</div>
		</button>
	);
}

function formatCardText(text: string, card: CardInstance, def: ReturnType<typeof getCard>): string {
	if (!def) return text;
	const upgraded = card.upgraded;
	return text
		.replace(/\[(\d+)\|(\d+)]/g, (_m, base, up) => (upgraded ? up : base))
		.replace(/\{\{QueryLink\|[^|]*\|[^|]*\|([^}]*)}}/g, "$1")
		.replace(/<br\s*\/?>/g, " ")
		.replace(/\$/g, "");
}
