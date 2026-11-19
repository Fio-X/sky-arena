import { motion } from "framer-motion";
import { getMonster } from "../../engine/content/loader";
import type { MonsterState } from "../../engine/core/types";
import { tMonster, tUi } from "../../i18n";
import { type FloatingText, FloatLayer } from "./CombatAnimations";
import { HpBar, PowerList } from "./CombatWidgets";

export function MonsterView({
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
	// halfDead (Darkling regrowing, Awakened One before rebirth): shown dimmed, still has an intent
	if (!monster.alive && !monster.halfDead) return null;
	const hpPct = Math.max(0, (monster.currentHp / monster.maxHp) * 100);
	const isLowHp = hpPct < 30;

	return (
		<motion.button
			type="button"
			onClick={onClick}
			initial={{ opacity: 0, y: 20 }}
			animate={{ opacity: monster.halfDead ? 0.45 : 1, y: 0 }}
			exit={{ opacity: 0, scale: 0.8 }}
			whileHover={highlighted ? { scale: 1.05 } : {}}
			style={{
				padding: "1rem 1.25rem",
				background: "var(--bg-glass)",
				backdropFilter: "blur(12px)",
				border: `2px solid ${highlighted ? "var(--accent)" : "var(--border)"}`,
				borderRadius: 16,
				textAlign: "center",
				minWidth: 170,
				cursor: highlighted ? "pointer" : "default",
				position: "relative",
				boxShadow: highlighted
					? "0 0 24px rgba(255,60,111,0.3), var(--shadow-lg)"
					: "var(--shadow-lg)",
				transition: "border-color 0.2s, box-shadow 0.2s",
			}}
		>
			<FloatLayer items={floats} />
			<IntentDisplay monster={monster} />

			<div
				style={{
					width: 64,
					height: 64,
					borderRadius: "50%",
					background: `radial-gradient(circle at 40% 35%, ${isLowHp ? "#4a1a2a" : "var(--bg-card-hover)"}, var(--bg-card))`,
					border: `2px solid ${isLowHp ? "var(--accent)44" : "var(--border)"}`,
					margin: "0 auto 0.5rem",
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					fontSize: "1.5rem",
					transition: "background 0.3s",
				}}
			>
				{getMonsterIcon(monster.id)}
			</div>

			<div
				style={{
					fontWeight: 700,
					fontSize: "0.9rem",
					marginBottom: "0.5rem",
					letterSpacing: "0.02em",
				}}
			>
				{tMonster(monster.id, getMonster(monster.id)?.name ?? monster.id)}
			</div>

			<HpBar current={monster.currentHp} max={monster.maxHp} />

			{monster.block > 0 && (
				<div
					style={{
						fontSize: "0.75rem",
						color: "var(--accent-cyan)",
						marginTop: "0.375rem",
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						gap: "0.25rem",
						fontWeight: 600,
					}}
				>
					<svg
						width={14}
						height={14}
						viewBox="0 0 24 24"
						fill="currentColor"
						role="img"
						aria-label="block"
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
		</motion.button>
	);
}

function getMonsterIcon(id: string): string {
	if (id.includes("LOUSE")) return "🪲";
	if (id.includes("CULTIST")) return "🗡";
	if (id.includes("JAW")) return "🐺";
	if (id.includes("SLIME")) return "🟢";
	if (id.includes("FUNGI")) return "🍄";
	if (id.includes("KNIGHT") || id.includes("GUARDIAN")) return "⚔";
	if (id.includes("SENTRY")) return "🔮";
	if (id.includes("LOOTER") || id.includes("MUGGER")) return "💰";
	if (id.includes("HEXAGHOST")) return "👻";
	if (id.includes("LAGAVULIN")) return "😴";
	if (id.includes("NOBS") || id.includes("NOB")) return "👹";
	return "👾";
}

function IntentDisplay({ monster }: { monster: MonsterState }) {
	const { intent } = monster;
	let label: string;
	let color: string;
	let icon: string;

	if (intent.isAttack) {
		const dmg = intent.baseDamage ?? "?";
		const multi = intent.hits > 1 ? `×${intent.hits}` : "";
		label = `${dmg}${multi}`;
		color = "var(--accent)";
		icon = "⚔";
	} else if (intent.isBuff) {
		label = tUi("buff");
		color = "var(--accent-gold)";
		icon = "↑";
	} else if (intent.isDebuff) {
		label = tUi("debuff");
		color = "var(--accent-blue)";
		icon = "↓";
	} else {
		label = "";
		color = "var(--text-dim)";
		icon = "?";
	}

	return (
		<motion.div
			initial={{ opacity: 0, y: -8 }}
			animate={{ opacity: monster.halfDead ? 0.45 : 1, y: 0 }}
			style={{
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				gap: "0.3rem",
				fontSize: "0.8rem",
				color,
				marginBottom: "0.25rem",
				fontWeight: 700,
			}}
		>
			<span style={{ fontSize: "0.9rem" }}>{icon}</span>
			{label && <span>{label}</span>}
		</motion.div>
	);
}
