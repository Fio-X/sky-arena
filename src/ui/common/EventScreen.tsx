import { motion } from "framer-motion";
import { eventOptions, getEvent } from "../../engine/core/event";
import { getEventHandler } from "../../engine/core/eventRegistry";
import { getLocale, tEvent, tUi } from "../../i18n";
import { useGameStore } from "../../store/gameStore";

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
	padding: "2.5rem 2.5rem 2rem",
	boxShadow: "var(--shadow-lg), 0 0 40px rgba(108,92,231,0.1)",
	display: "flex" as const,
	flexDirection: "column" as const,
	alignItems: "center" as const,
	gap: "1.5rem",
	maxWidth: 520,
	width: "100%",
};

const mysteryGlow: React.CSSProperties = {
	fontSize: "3rem",
	filter: "drop-shadow(0 0 16px rgba(108,92,231,0.6)) drop-shadow(0 0 32px rgba(108,92,231,0.3))",
	lineHeight: 1,
};

export function EventScreen() {
	const state = useGameStore((s) => s.state);
	const dispatch = useGameStore((s) => s.dispatch);

	if (state?.phase.type !== "event") return null;
	const def = getEvent(state.phase.eventId);

	if (!def) {
		return (
			<div style={containerStyle}>
				<motion.div
					initial={{ opacity: 0, scale: 0.95 }}
					animate={{ opacity: 1, scale: 1 }}
					transition={{ duration: 0.4 }}
					style={panelStyle}
				>
					<div style={mysteryGlow}>❓</div>
					<h2 style={{ fontSize: "1.3rem", fontWeight: 700, color: "var(--text-bright)" }}>
						{tUi("unknownEvent")}
					</h2>
					<motion.button
						type="button"
						onClick={() => dispatch({ type: "proceed" })}
						whileHover={{ scale: 1.04, boxShadow: "0 0 16px rgba(108,92,231,0.3)" }}
						whileTap={{ scale: 0.97 }}
						style={{
							padding: "0.75rem 2rem",
							borderRadius: 10,
							background: "linear-gradient(135deg, var(--accent-blue), #8b5cf6)",
							border: "1px solid rgba(108,92,231,0.4)",
							color: "var(--text-bright)",
							fontWeight: 600,
							cursor: "pointer",
						}}
					>
						{tUi("continue")}
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
				<div style={mysteryGlow}>✨</div>
				<h2
					style={{
						fontSize: "1.4rem",
						fontWeight: 700,
						color: "var(--text-bright)",
						letterSpacing: "0.02em",
						textAlign: "center",
					}}
				>
					{tEvent(state.phase.eventId, def.name)}
				</h2>
				<p
					style={{
						color: "var(--text-dim)",
						maxWidth: 420,
						textAlign: "center",
						fontSize: "0.9rem",
						lineHeight: 1.6,
					}}
				>
					{def.summary}
				</p>

				<div
					style={{
						display: "flex",
						flexDirection: "column",
						gap: "0.6rem",
						width: "100%",
						marginTop: "0.25rem",
					}}
				>
					{eventOptions(state).map((option, i) => (
						<motion.button
							type="button"
							key={`${state.phase.type === "event" ? state.phase.screen : 0}-${option.label}`}
							disabled={option.disabled}
							onClick={() => dispatch({ type: "chooseEventOption", index: i })}
							initial={{ opacity: 0, x: -16 }}
							animate={{ opacity: 1, x: 0 }}
							transition={{ delay: 0.15 + i * 0.08, duration: 0.35 }}
							whileHover={{
								scale: 1.02,
								borderColor: "rgba(108,92,231,0.5)",
								boxShadow: "0 0 20px rgba(108,92,231,0.2)",
							}}
							whileTap={{ scale: 0.98 }}
							style={{
								padding: "0.85rem 1.25rem",
								border: "1px solid var(--border)",
								borderRadius: 10,
								textAlign: "left",
								background: "var(--bg-card)",
								color: "var(--text)",
								fontSize: "0.9rem",
								fontWeight: 500,
								cursor: option.disabled ? "not-allowed" : "pointer",
								opacity: option.disabled ? 0.45 : 1,
							}}
						>
							{getLocale() === "zh" && option.zh ? option.zh : option.label}
						</motion.button>
					))}
				</div>

				{/* Events with a handler offer their own way out; the generic Leave is for data-only events. */}
				{!getEventHandler(state.phase.eventId) && (
					<motion.button
						type="button"
						onClick={() => dispatch({ type: "proceed" })}
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						transition={{ delay: 0.4, duration: 0.3 }}
						whileHover={{ scale: 1.03 }}
						whileTap={{ scale: 0.97 }}
						style={{
							padding: "0.5rem 1.5rem",
							color: "var(--text-dim)",
							background: "transparent",
							border: "1px solid var(--border)",
							borderRadius: 10,
							cursor: "pointer",
							fontSize: "0.85rem",
							marginTop: "0.25rem",
						}}
					>
						{tUi("leave")}
					</motion.button>
				)}
			</motion.div>
		</div>
	);
}
