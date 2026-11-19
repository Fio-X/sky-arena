import { motion } from "framer-motion";
import { getCard, getPotion } from "../../engine/content/loader";
import { tCard, tCardText, tPotion, tUi } from "../../i18n";
import { useGameStore } from "../../store/gameStore";
import { cardTypeLabel, formatCardTextSimple, rarityLabel } from "../cardTextUtils";

const overlay = {
	position: "fixed" as const,
	inset: 0,
	background: "radial-gradient(ellipse at 50% 30%, rgba(108,92,231,0.08) 0%, transparent 70%)",
	display: "flex" as const,
	flexDirection: "column" as const,
	alignItems: "center" as const,
	justifyContent: "center" as const,
	gap: "1.5rem",
	zIndex: 50,
};

const panelStyle = {
	background: "var(--bg-glass)",
	backdropFilter: "blur(12px)",
	WebkitBackdropFilter: "blur(12px)",
	border: "1px solid var(--border)",
	borderRadius: 16,
	padding: "2.5rem 3rem",
	boxShadow: "var(--shadow-lg), var(--shadow-glow)",
	display: "flex" as const,
	flexDirection: "column" as const,
	alignItems: "center" as const,
	gap: "1.5rem",
	maxWidth: 720,
	width: "90vw",
};

const titleStyle = {
	fontSize: "1.5rem",
	fontWeight: 800,
	letterSpacing: "0.04em",
	background: "linear-gradient(135deg, var(--accent-gold) 0%, #ffe080 100%)",
	WebkitBackgroundClip: "text",
	WebkitTextFillColor: "transparent",
	textShadow: "none",
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

function rarityGlow(rarity?: string): string {
	switch (rarity) {
		case "rare":
			return "0 0 12px rgba(255,200,48,0.25)";
		case "uncommon":
			return "0 0 12px rgba(108,92,231,0.25)";
		default:
			return "none";
	}
}

export function RewardScreen() {
	const state = useGameStore((s) => s.state);
	const dispatch = useGameStore((s) => s.dispatch);
	if (state?.phase.type !== "reward") return null;

	const { cardRewards, potionReward, gold } = state.phase;

	return (
		<div style={overlay}>
			<motion.div
				style={panelStyle}
				initial={{ opacity: 0, y: 30, scale: 0.95 }}
				animate={{ opacity: 1, y: 0, scale: 1 }}
				transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
			>
				{/* Title */}
				<motion.h2
					style={titleStyle}
					initial={{ opacity: 0, y: -10 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ delay: 0.15, duration: 0.4 }}
				>
					{tUi("victory")}
				</motion.h2>

				{/* Gold */}
				{gold > 0 && (
					<motion.p
						style={{
							color: "var(--accent-gold)",
							fontSize: "1.1rem",
							fontWeight: 700,
							textShadow: "0 0 8px rgba(255,200,48,0.3)",
						}}
						initial={{ opacity: 0, scale: 0.8 }}
						animate={{ opacity: 1, scale: 1 }}
						transition={{ delay: 0.25, duration: 0.3 }}
					>
						+{gold} {tUi("goldUnit")}
					</motion.p>
				)}

				{/* Potion reward */}
				{potionReward && (
					<motion.button
						type="button"
						onClick={() => dispatch({ type: "obtainPotionReward" })}
						style={{
							padding: "0.75rem 1.5rem",
							background:
								"linear-gradient(135deg, rgba(102,51,153,0.4) 0%, rgba(140,80,200,0.25) 100%)",
							color: "#fff",
							border: "1px solid rgba(140,80,200,0.5)",
							borderRadius: 10,
							fontWeight: 600,
							backdropFilter: "blur(6px)",
							boxShadow: "0 0 12px rgba(140,80,200,0.2)",
						}}
						initial={{ opacity: 0, x: -20 }}
						animate={{ opacity: 1, x: 0 }}
						transition={{ delay: 0.3, duration: 0.35 }}
						whileHover={{ scale: 1.04, boxShadow: "0 0 18px rgba(140,80,200,0.35)" }}
						whileTap={{ scale: 0.97 }}
					>
						{tUi("takePotion").replace(
							"{0}",
							tPotion(potionReward, getPotion(potionReward)?.name ?? potionReward),
						)}
					</motion.button>
				)}

				{/* Card rewards */}
				{cardRewards.length > 0 && (
					<>
						<p style={{ color: "var(--text-dim)", fontSize: "0.85rem" }}>{tUi("chooseCard")}</p>
						<div
							style={{
								display: "flex",
								gap: "0.75rem",
								flexWrap: "wrap",
								justifyContent: "center",
							}}
						>
							{cardRewards.map((cardId, i) => {
								const def = getCard(cardId);
								const name = tCard(cardId, def?.name ?? cardId);
								const rawText = tCardText(cardId, def?.text ?? "");
								const rarityColor =
									def?.rarity === "rare"
										? "var(--rare)"
										: def?.rarity === "uncommon"
											? "var(--uncommon)"
											: "var(--common)";
								const typeColor = cardTypeColor(def?.type);

								return (
									<motion.button
										type="button"
										key={cardId}
										onClick={() => dispatch({ type: "chooseCardReward", index: i })}
										style={{
											padding: "1rem 1.25rem",
											border: `1px solid ${rarityColor}`,
											borderRadius: 12,
											minWidth: 150,
											maxWidth: 200,
											textAlign: "center",
											background: "var(--bg-card)",
											boxShadow: `var(--shadow-md), ${rarityGlow(def?.rarity)}`,
											display: "flex",
											flexDirection: "column",
											alignItems: "center",
											gap: "0.3rem",
										}}
										initial={{ opacity: 0, y: 30, scale: 0.85 }}
										animate={{ opacity: 1, y: 0, scale: 1 }}
										transition={{
											delay: 0.35 + i * 0.1,
											duration: 0.4,
											ease: [0.16, 1, 0.3, 1],
										}}
										whileHover={{
											scale: 1.06,
											borderColor: typeColor,
											boxShadow: `0 4px 24px rgba(0,0,0,0.5), 0 0 16px ${typeColor}33`,
										}}
										whileTap={{ scale: 0.96 }}
									>
										{/* Cost */}
										<div
											style={{
												fontSize: "0.8rem",
												fontWeight: 700,
												color: "var(--energy)",
												textShadow: "0 0 6px var(--energy-glow)",
											}}
										>
											{def?.cost ?? "?"}
										</div>

										{/* Name */}
										<div
											style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--text-bright)" }}
										>
											{name}
										</div>

										{/* Type & rarity badge */}
										<div
											style={{
												fontSize: "0.65rem",
												color: typeColor,
												fontWeight: 600,
												padding: "1px 8px",
												borderRadius: 8,
												background: `${typeColor}15`,
												border: `1px solid ${typeColor}30`,
											}}
										>
											{rarityLabel(def?.rarity)} · {cardTypeLabel(def?.type)}
										</div>

										{/* Description */}
										{rawText && (
											<div
												style={{
													fontSize: "0.6rem",
													color: "var(--text-dim)",
													lineHeight: 1.4,
													marginTop: "0.15rem",
												}}
											>
												{formatCardTextSimple(rawText)}
											</div>
										)}
									</motion.button>
								);
							})}
						</div>
					</>
				)}

				{/* Skip / Continue */}
				<motion.button
					type="button"
					onClick={() => {
						if (cardRewards.length > 0) {
							dispatch({ type: "skipCardReward" });
						} else {
							dispatch({ type: "proceed" });
						}
					}}
					style={{
						padding: "0.7rem 2.5rem",
						background: "linear-gradient(135deg, var(--bg-card) 0%, var(--bg-panel) 100%)",
						border: "1px solid var(--border)",
						borderRadius: 10,
						fontWeight: 600,
						color: "var(--text)",
						marginTop: "0.5rem",
					}}
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					transition={{ delay: 0.6, duration: 0.3 }}
					whileHover={{
						scale: 1.05,
						borderColor: "var(--border-glow)",
						boxShadow: "var(--shadow-glow)",
					}}
					whileTap={{ scale: 0.96 }}
				>
					{cardRewards.length > 0 ? tUi("skip") : tUi("continue")}
				</motion.button>
			</motion.div>
		</div>
	);
}
