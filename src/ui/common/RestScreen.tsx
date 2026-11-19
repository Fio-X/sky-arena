import { motion } from "framer-motion";
import { useState } from "react";
import { getCard } from "../../engine/content/loader";
import { restOptionAvailable } from "../../engine/content/relicsRun2";
import type { RestOption } from "../../engine/core/types";
import { getLocale, tCard, tCardText, tUi, tUiFmt } from "../../i18n";
import { useGameStore } from "../../store/gameStore";
import { cardTypeLabel } from "../cardTextUtils";

const containerStyle: React.CSSProperties = {
	height: "calc(100vh - 36px)",
	display: "flex",
	flexDirection: "column",
	alignItems: "center",
	justifyContent: "center",
	gap: "1.5rem",
	padding: "2rem 1rem",
};

const panelStyle = {
	background: "var(--bg-glass)",
	backdropFilter: "blur(12px)",
	WebkitBackdropFilter: "blur(12px)",
	border: "1px solid var(--border)",
	borderRadius: 16,
	padding: "2.5rem 3rem",
	boxShadow: "var(--shadow-lg)",
	display: "flex" as const,
	flexDirection: "column" as const,
	alignItems: "center" as const,
	gap: "1.5rem",
	maxWidth: 480,
	width: "100%",
};

const fireGlow: React.CSSProperties = {
	fontSize: "3rem",
	filter: "drop-shadow(0 0 16px rgba(255,200,48,0.6)) drop-shadow(0 0 32px rgba(255,60,111,0.3))",
	lineHeight: 1,
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

function ActionButton({
	onClick,
	disabled,
	color,
	children,
	delay = 0,
}: {
	onClick: () => void;
	disabled?: boolean;
	color: string;
	children: React.ReactNode;
	delay?: number;
}) {
	return (
		<motion.button
			type="button"
			onClick={onClick}
			disabled={disabled}
			initial={{ opacity: 0, y: 12 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ delay, duration: 0.4 }}
			whileHover={disabled ? {} : { scale: 1.04, boxShadow: `0 0 20px ${color}44` }}
			whileTap={disabled ? {} : { scale: 0.97 }}
			style={{
				width: "100%",
				padding: "0.9rem 1.5rem",
				borderRadius: 12,
				border: `1px solid ${color}55`,
				background: `linear-gradient(135deg, ${color}18, ${color}08)`,
				color: "var(--text)",
				fontSize: "1rem",
				fontWeight: 600,
				cursor: disabled ? "default" : "pointer",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				gap: "0.6rem",
			}}
		>
			{children}
		</motion.button>
	);
}

export function RestScreen() {
	const state = useGameStore((s) => s.state);
	const dispatch = useGameStore((s) => s.dispatch);
	const [mode, setMode] = useState<"choose" | "smith">("choose");

	if (!state) return null;

	const owns = (id: string) => state.relics.some((r) => r.id === id);
	const healAmount = Math.floor(state.maxHp * 0.3) + (owns("REGAL_PILLOW") ? 15 : 0);
	const zh = getLocale() === "zh";
	const relicOptions: { option: RestOption; label: string; color: string }[] = [
		{ option: "lift", label: zh ? "🏋️ 举重（+1 力量）" : "🏋️ Lift (+1 Strength)", color: "#ff9f43" },
		{
			option: "toke",
			label: zh ? "🚬 抽烟（移除一张牌）" : "🚬 Toke (remove a card)",
			color: "#a29bfe",
		},
		{
			option: "dig",
			label: zh ? "⛏️ 挖掘（获得遗物）" : "⛏️ Dig (obtain a relic)",
			color: "#00d2d3",
		},
	];
	const upgradable = state.deck
		.map((c, i) => ({ card: c, index: i }))
		.filter((e) => !e.card.upgraded);

	if (mode === "smith") {
		return (
			<div style={containerStyle}>
				<motion.div
					initial={{ opacity: 0, scale: 0.95 }}
					animate={{ opacity: 1, scale: 1 }}
					transition={{ duration: 0.4 }}
					style={{ ...panelStyle, maxWidth: 700 }}
				>
					<div style={fireGlow}>🔨</div>
					<h2
						style={{
							fontSize: "1.3rem",
							fontWeight: 700,
							color: "var(--text-bright)",
							letterSpacing: "0.02em",
						}}
					>
						{tUi("smithChoose")}
					</h2>
					<div
						style={{
							display: "flex",
							gap: "0.6rem",
							flexWrap: "wrap",
							justifyContent: "center",
							maxWidth: 600,
							width: "100%",
						}}
					>
						{upgradable.map((e, idx) => {
							const def = getCard(e.card.id);
							const typeColor = cardTypeColor(def?.type);
							return (
								<motion.button
									type="button"
									key={e.card.uniqueId}
									onClick={() => dispatch({ type: "smith", cardIndex: e.index })}
									initial={{ opacity: 0, y: 20 }}
									animate={{ opacity: 1, y: 0 }}
									transition={{ delay: idx * 0.03, duration: 0.3 }}
									whileHover={{
										scale: 1.06,
										borderColor: typeColor,
										boxShadow: `0 0 16px ${typeColor}44`,
									}}
									whileTap={{ scale: 0.95 }}
									title={tCardText(e.card.id, def?.text ?? "")}
									style={{
										padding: "0.6rem 0.85rem",
										minWidth: 100,
										textAlign: "center",
										background: "var(--bg-card)",
										border: "1px solid var(--border)",
										borderRadius: 10,
										cursor: "pointer",
									}}
								>
									<div
										style={{
											fontSize: "0.7rem",
											color: "var(--energy)",
											fontWeight: 700,
											marginBottom: "0.15rem",
										}}
									>
										{def?.cost ?? "?"}
									</div>
									<div style={{ fontWeight: 600, fontSize: "0.85rem" }}>
										{tCard(e.card.id, def?.name ?? e.card.id)}
									</div>
									<div
										style={{
											fontSize: "0.65rem",
											color: typeColor,
											fontWeight: 500,
											marginTop: "0.15rem",
										}}
									>
										{cardTypeLabel(def?.type)}
									</div>
								</motion.button>
							);
						})}
					</div>
					<motion.button
						type="button"
						onClick={() => setMode("choose")}
						whileHover={{ scale: 1.03 }}
						whileTap={{ scale: 0.97 }}
						style={{
							marginTop: "0.5rem",
							padding: "0.6rem 1.5rem",
							borderRadius: 10,
							background: "var(--bg-panel)",
							border: "1px solid var(--border)",
							color: "var(--text-dim)",
							cursor: "pointer",
						}}
					>
						{tUi("back")}
					</motion.button>
				</motion.div>
			</div>
		);
	}

	return (
		<div style={containerStyle}>
			<motion.div
				initial={{ opacity: 0, scale: 0.95 }}
				animate={{ opacity: 1, scale: 1 }}
				transition={{ duration: 0.5 }}
				style={panelStyle}
			>
				<div style={fireGlow}>🔥</div>
				<h2
					style={{
						fontSize: "1.4rem",
						fontWeight: 700,
						color: "var(--text-bright)",
						letterSpacing: "0.02em",
					}}
				>
					{tUi("restSite")}
				</h2>
				<div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", width: "100%" }}>
					<ActionButton
						onClick={() => dispatch({ type: "rest" })}
						disabled={owns("COFFEE_DRIPPER")}
						color="#ff6b8a"
						delay={0.1}
					>
						❤️ {tUiFmt("restHeal", String(healAmount))}
					</ActionButton>
					<ActionButton
						onClick={() => setMode("smith")}
						disabled={upgradable.length === 0 || owns("FUSION_HAMMER")}
						color="var(--accent-gold)"
						delay={0.2}
					>
						🔨 {tUi("smithUpgrade")}
					</ActionButton>
					{relicOptions
						.filter((o) => restOptionAvailable(state, o.option))
						.map((o, i) => (
							<ActionButton
								key={o.option}
								onClick={() => dispatch({ type: "restOption", option: o.option })}
								color={o.color}
								delay={0.3 + i * 0.1}
							>
								{o.label}
							</ActionButton>
						))}
				</div>
			</motion.div>
		</div>
	);
}
