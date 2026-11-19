import { motion } from "framer-motion";
import { getRelic } from "../../engine/content/loader";
import { tRelic, tUi } from "../../i18n";
import { useGameStore } from "../../store/gameStore";

const overlayStyle = {
	position: "fixed" as const,
	inset: 0,
	background: "radial-gradient(ellipse at 50% 30%, rgba(255,200,48,0.06) 0%, transparent 70%)",
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
	boxShadow: "var(--shadow-lg), 0 0 24px rgba(255,200,48,0.08)",
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
};

export function BossRewardScreen() {
	const state = useGameStore((s) => s.state);
	const dispatch = useGameStore((s) => s.dispatch);

	if (state?.phase.type !== "bossReward") return null;
	const { relics } = state.phase;

	return (
		<div style={overlayStyle}>
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
					{tUi("bossDefeated")}
				</motion.h2>

				<motion.p
					style={{ color: "var(--text-dim)", fontSize: "0.85rem" }}
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					transition={{ delay: 0.25, duration: 0.3 }}
				>
					{tUi("chooseBossRelic")}
				</motion.p>

				{/* Relic cards */}
				<div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", justifyContent: "center" }}>
					{relics.map((relicId, i) => {
						const def = getRelic(relicId as string);
						return (
							<motion.button
								type="button"
								key={relicId as string}
								onClick={() => dispatch({ type: "chooseBossRelic", index: i })}
								style={{
									padding: "1.5rem 1.25rem",
									border: "1px solid var(--accent-gold)",
									borderRadius: 14,
									minWidth: 180,
									maxWidth: 220,
									textAlign: "center",
									background: "linear-gradient(180deg, var(--bg-card) 0%, var(--bg-panel) 100%)",
									boxShadow: "var(--shadow-md), 0 0 14px rgba(255,200,48,0.12)",
									display: "flex",
									flexDirection: "column",
									alignItems: "center",
									gap: "0.5rem",
								}}
								initial={{ opacity: 0, y: 24, scale: 0.88 }}
								animate={{ opacity: 1, y: 0, scale: 1 }}
								transition={{
									delay: 0.3 + i * 0.12,
									duration: 0.45,
									ease: [0.16, 1, 0.3, 1],
								}}
								whileHover={{
									scale: 1.06,
									boxShadow: "0 4px 28px rgba(0,0,0,0.5), 0 0 20px rgba(255,200,48,0.2)",
									borderColor: "#ffe080",
								}}
								whileTap={{ scale: 0.96 }}
							>
								{/* Relic icon placeholder - golden diamond */}
								<div
									style={{
										width: 28,
										height: 28,
										background: "linear-gradient(135deg, var(--accent-gold), #ffe080)",
										borderRadius: 6,
										transform: "rotate(45deg)",
										boxShadow: "0 0 10px rgba(255,200,48,0.3)",
									}}
								/>

								{/* Relic name */}
								<div
									style={{
										fontWeight: 700,
										fontSize: "1rem",
										color: "var(--accent-gold)",
										textShadow: "0 0 8px rgba(255,200,48,0.2)",
									}}
								>
									{tRelic(relicId as string, def?.name ?? (relicId as string))}
								</div>

								{/* Relic description */}
								<div
									style={{
										fontSize: "0.75rem",
										color: "var(--text-dim)",
										lineHeight: 1.4,
									}}
								>
									{def?.text ?? ""}
								</div>
							</motion.button>
						);
					})}
				</div>
			</motion.div>
		</div>
	);
}
