import { useState } from "react";
import { getCard, getMonster, getPower } from "../../engine/content/loader";
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
					gap: "2rem",
					padding: "1.5rem",
					background: "radial-gradient(ellipse at 50% 60%, rgba(127,90,240,0.06), transparent 70%)",
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
					gap: "1.25rem",
					padding: "0.625rem 1rem",
					background: "linear-gradient(180deg, var(--bg-panel), var(--bg))",
					borderTop: "1px solid var(--border)",
					alignItems: "center",
					position: "relative",
				}}
			>
				<FloatLayer items={playerFloats} />
				{combat.player.block > 0 && (
					<span
						style={{
							color: "var(--accent-blue)",
							display: "flex",
							alignItems: "center",
							gap: "0.25rem",
							fontWeight: "bold",
						}}
					>
						<svg
							width={16}
							height={16}
							viewBox="0 0 24 24"
							fill="currentColor"
							role="img"
							aria-label="Block"
						>
							<path d="M12 2L3 9v6c0 5.55 3.84 9.74 9 11 5.16-1.26 9-5.45 9-11V9l-9-7z" />
						</svg>
						{combat.player.block}
					</span>
				)}
				<EnergyOrb current={combat.energy} max={combat.maxEnergy} />
				<span style={{ color: "var(--text-dim)", fontSize: "0.8rem" }}>
					Draw {combat.drawPile.length} · Discard {combat.discardPile.length}
					{combat.exhaustPile.length > 0 && ` · Exhaust ${combat.exhaustPile.length}`}
				</span>
				{combat.player.powers.length > 0 && <PowerList powers={combat.player.powers} />}
				<button
					type="button"
					onClick={() => dispatch({ type: "endTurn" })}
					style={{
						background: "var(--accent)",
						color: "#fff",
						border: "none",
						padding: "0.5rem 1.25rem",
						fontWeight: "bold",
						fontSize: "0.9rem",
						borderRadius: 6,
						boxShadow: "0 2px 8px rgba(229,49,112,0.3)",
					}}
				>
					End Turn
				</button>
			</div>

			{/* Hand */}
			<div
				style={{
					display: "flex",
					justifyContent: "center",
					padding: "0.75rem 1rem 1.25rem",
					background: "var(--bg-panel)",
					position: "relative",
				}}
			>
				{combat.hand.map((c, i) => {
					const count = combat.hand.length;
					const mid = (count - 1) / 2;
					const offset = i - mid;
					const maxAngle = Math.min(4, 20 / Math.max(count, 1));
					const angle = offset * maxAngle;
					const lift = -Math.abs(offset) * 3;
					return (
						<CardView
							key={c.uniqueId}
							card={c}
							selected={selectedCard === i}
							playable={(c.freeToPlay || c.costForTurn <= combat.energy) && c.costForTurn >= 0}
							onClick={() => handleCardClick(i)}
							fanStyle={{
								transform: `rotate(${angle}deg) translateY(${lift}px)`,
								marginLeft: i === 0 ? 0 : -6,
								zIndex: selectedCard === i ? 20 : i,
							}}
						/>
					);
				})}
			</div>
		</div>
	);
}

function EnergyOrb({ current, max }: { current: number; max: number }) {
	const hasEnergy = current > 0;
	return (
		<div
			style={{
				width: 52,
				height: 52,
				borderRadius: "50%",
				border: "3px solid var(--energy)",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				fontWeight: "bold",
				fontSize: "1.1rem",
				color: "var(--energy)",
				background: "radial-gradient(circle at 40% 35%, var(--bg-card-hover), var(--bg-card))",
				flexShrink: 0,
				boxShadow: hasEnergy
					? "0 0 12px rgba(255,216,3,0.4), inset 0 0 8px rgba(255,216,3,0.15)"
					: "var(--shadow-sm)",
				transition: "box-shadow 0.3s",
			}}
		>
			{current}/{max}
		</div>
	);
}

function PowerList({ powers }: { powers: PowerInstance[] }) {
	return (
		<span style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap" }}>
			{powers.map((p) => {
				const def = getPower(p.id);
				const isBuff = def?.kind === "buff" || p.amount > 0;
				return (
					<span
						key={p.id}
						style={{
							padding: "0.125rem 0.5rem",
							background: isBuff ? "rgba(127,90,240,0.2)" : "rgba(229,49,112,0.2)",
							border: `1px solid ${isBuff ? "var(--accent-blue)" : "var(--accent)"}`,
							borderRadius: 10,
							fontSize: "0.7rem",
							color: isBuff ? "var(--accent-blue)" : "var(--accent)",
							fontWeight: 600,
						}}
						title={def?.text ?? p.id}
					>
						{def?.name ?? p.id} {p.amount}
					</span>
				);
			})}
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
				padding: "1rem",
				background: "linear-gradient(180deg, var(--bg-card-hover), var(--bg-card))",
				border: `2px solid ${highlighted ? "var(--accent)" : "var(--border)"}`,
				borderRadius: 12,
				textAlign: "center",
				minWidth: 160,
				cursor: highlighted ? "pointer" : "default",
				transition: "border-color 0.15s, box-shadow 0.15s",
				position: "relative",
				boxShadow: highlighted
					? "0 0 16px rgba(229,49,112,0.3), var(--shadow-md)"
					: "var(--shadow-md)",
			}}
		>
			<FloatLayer items={floats} />
			<IntentDisplay monster={monster} />
			<div
				style={{
					fontWeight: "bold",
					marginBottom: "0.5rem",
					fontSize: "1rem",
					letterSpacing: "0.02em",
				}}
			>
				{getMonster(monster.id)?.name ?? monster.id}
			</div>
			<HpBar current={monster.currentHp} max={monster.maxHp} />
			{monster.block > 0 && (
				<div
					style={{
						fontSize: "0.8rem",
						color: "var(--accent-blue)",
						marginTop: "0.375rem",
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						gap: "0.25rem",
					}}
				>
					<svg
						width={14}
						height={14}
						viewBox="0 0 24 24"
						fill="currentColor"
						role="img"
						aria-label="Block"
					>
						<path d="M12 2L3 9v6c0 5.55 3.84 9.74 9 11 5.16-1.26 9-5.45 9-11V9l-9-7z" />
					</svg>
					{monster.block}
				</div>
			)}
			{monster.powers.length > 0 && (
				<div style={{ marginTop: "0.375rem" }}>
					<PowerList powers={monster.powers} />
				</div>
			)}
		</button>
	);
}

function IntentIcon({ type }: { type: "attack" | "buff" | "debuff" | "unknown" }) {
	const size = 20;
	const common = { width: size, height: size, display: "inline-block", verticalAlign: "middle" };
	if (type === "attack") {
		return (
			<svg
				{...common}
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth={2.5}
				role="img"
				aria-label="Attack"
			>
				<path d="M4 20L20 4M14 4h6v6" strokeLinecap="round" strokeLinejoin="round" />
			</svg>
		);
	}
	if (type === "buff") {
		return (
			<svg
				{...common}
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth={2.5}
				role="img"
				aria-label="Buff"
			>
				<path d="M12 3v18M5 10l7-7 7 7" strokeLinecap="round" strokeLinejoin="round" />
			</svg>
		);
	}
	if (type === "debuff") {
		return (
			<svg
				{...common}
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth={2.5}
				role="img"
				aria-label="Debuff"
			>
				<path d="M12 3v18M5 14l7 7 7-7" strokeLinecap="round" strokeLinejoin="round" />
			</svg>
		);
	}
	return (
		<svg
			{...common}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={2.5}
			role="img"
			aria-label="Unknown"
		>
			<circle cx={12} cy={12} r={8} />
			<path d="M12 8v4M12 16h.01" strokeLinecap="round" />
		</svg>
	);
}

function IntentDisplay({ monster }: { monster: MonsterState }) {
	const { intent } = monster;
	let label: string;
	let color: string;
	let iconType: "attack" | "buff" | "debuff" | "unknown";

	if (intent.isAttack) {
		const dmg = intent.baseDamage ?? "?";
		const multi = intent.hits > 1 ? ` ×${intent.hits}` : "";
		label = `${dmg}${multi}`;
		color = "var(--accent)";
		iconType = "attack";
	} else if (intent.isBuff) {
		label = "Buff";
		color = "var(--accent-gold)";
		iconType = "buff";
	} else if (intent.isDebuff) {
		label = "Debuff";
		color = "var(--accent-blue)";
		iconType = "debuff";
	} else {
		label = "";
		color = "var(--text-dim)";
		iconType = "unknown";
	}

	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				gap: "0.25rem",
				fontSize: "0.8rem",
				color,
				marginBottom: "0.375rem",
				fontWeight: "bold",
			}}
		>
			<IntentIcon type={iconType} />
			{label && <span>{label}</span>}
		</div>
	);
}

function HpBar({ current, max }: { current: number; max: number }) {
	const pct = Math.max(0, (current / max) * 100);
	return (
		<div
			style={{ display: "flex", alignItems: "center", gap: "0.375rem", justifyContent: "center" }}
		>
			<div
				style={{
					width: 100,
					height: 10,
					background: "var(--hp-bg)",
					borderRadius: 5,
					overflow: "hidden",
					boxShadow: "inset 0 1px 3px rgba(0,0,0,0.4)",
				}}
			>
				<div
					style={{
						width: `${pct}%`,
						height: "100%",
						background: "linear-gradient(90deg, var(--hp-bar), #ff6b6b)",
						borderRadius: 5,
						transition: "width 0.3s",
					}}
				/>
			</div>
			<span style={{ fontSize: "0.8rem", fontWeight: 600, minWidth: "3em", textAlign: "right" }}>
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
	fanStyle,
}: {
	card: CardInstance;
	selected: boolean;
	playable: boolean;
	onClick: () => void;
	fanStyle?: React.CSSProperties;
}) {
	const def = getCard(card.id);
	const name = def?.name ?? card.id;
	const cost = card.freeToPlay ? 0 : card.costForTurn;
	const desc = formatCardText(def?.text ?? "", card, def);

	const typeColor =
		def?.type === "attack"
			? "var(--card-attack)"
			: def?.type === "skill"
				? "var(--card-skill)"
				: def?.type === "power"
					? "var(--card-power)"
					: "var(--text-dim)";

	const rarityBorder =
		def?.rarity === "rare"
			? "var(--rare)"
			: def?.rarity === "uncommon"
				? "var(--uncommon)"
				: "var(--common)";

	const borderColor = selected ? "var(--accent)" : playable ? rarityBorder : "var(--border)";

	const baseTransform = fanStyle?.transform ?? "";
	const finalTransform = selected
		? `${baseTransform} translateY(-16px) scale(1.08)`
		: baseTransform || "none";

	return (
		<button
			type="button"
			onClick={onClick}
			disabled={!playable}
			style={{
				padding: 0,
				background: "var(--bg-card)",
				border: `2px solid ${borderColor}`,
				borderRadius: 8,
				width: 130,
				transform: finalTransform,
				transition: "transform 0.2s, border-color 0.15s, box-shadow 0.15s",
				textAlign: "center",
				overflow: "hidden",
				boxShadow: selected ? "0 8px 20px rgba(229,49,112,0.3)" : "var(--shadow-md)",
				transformOrigin: "bottom center",
				...(fanStyle ? { marginLeft: fanStyle.marginLeft, zIndex: fanStyle.zIndex } : {}),
			}}
		>
			{/* Color banner replacing illustration */}
			<div
				style={{
					height: 32,
					background: `linear-gradient(135deg, ${typeColor}44, ${typeColor}22)`,
					borderBottom: `2px solid ${typeColor}66`,
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					padding: "0 0.5rem",
				}}
			>
				<span
					style={{
						fontSize: "0.85rem",
						color: "var(--energy)",
						fontWeight: "bold",
						background: "rgba(0,0,0,0.5)",
						borderRadius: "50%",
						width: 22,
						height: 22,
						display: "inline-flex",
						alignItems: "center",
						justifyContent: "center",
					}}
				>
					{cost}
				</span>
				<span
					style={{
						fontSize: "0.55rem",
						color: typeColor,
						textTransform: "uppercase",
						fontWeight: "bold",
						letterSpacing: "0.05em",
					}}
				>
					{def?.type ?? ""}
				</span>
			</div>
			{/* Card body */}
			<div style={{ padding: "0.375rem 0.5rem 0.5rem" }}>
				<div
					style={{
						fontSize: "0.8rem",
						fontWeight: "bold",
						marginBottom: "0.25rem",
						color: "var(--text)",
					}}
				>
					{name}
					{card.upgraded ? "+" : ""}
				</div>
				<div
					style={{
						fontSize: "0.65rem",
						color: "var(--text-dim)",
						lineHeight: 1.4,
						minHeight: "2em",
					}}
				>
					{desc}
				</div>
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
