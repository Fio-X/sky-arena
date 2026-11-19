import { motion } from "framer-motion";
import { useState } from "react";
import { NEOW_BLESSINGS } from "../../engine/core/neow";
import { tNeow, tUi } from "../../i18n";
import { useGameStore } from "../../store/gameStore";

const blessingIcons: Record<string, string> = {
	gold100: "💰",
	upgradeRandom: "⬆",
	maxHp10: "❤",
	removeCard: "✂",
};

const bgStyle: React.CSSProperties = {
	height: "calc(100vh - 36px)",
	display: "flex",
	flexDirection: "column",
	alignItems: "center",
	justifyContent: "center",
	gap: "2rem",
	position: "relative",
	overflow: "hidden",
};

const orbBaseStyle: React.CSSProperties = {
	position: "absolute",
	borderRadius: "50%",
	filter: "blur(60px)",
	pointerEvents: "none",
};

export function NeowScreen() {
	const dispatch = useGameStore((s) => s.dispatch);

	return (
		<div style={bgStyle}>
			{/* Ambient divine orbs */}
			<div
				style={{
					...orbBaseStyle,
					width: 400,
					height: 400,
					top: "10%",
					left: "15%",
					background: "rgba(108, 92, 231, 0.15)",
					animation: "neow-drift 10s ease-in-out infinite alternate",
				}}
			/>
			<div
				style={{
					...orbBaseStyle,
					width: 300,
					height: 300,
					bottom: "10%",
					right: "15%",
					background: "rgba(0, 212, 255, 0.10)",
					animation: "neow-drift 14s ease-in-out infinite alternate-reverse",
				}}
			/>
			<div
				style={{
					...orbBaseStyle,
					width: 200,
					height: 200,
					top: "50%",
					left: "50%",
					transform: "translate(-50%, -50%)",
					background: "rgba(108, 92, 231, 0.20)",
					animation: "neow-pulse 6s ease-in-out infinite",
				}}
			/>

			<style>{`
				@keyframes neow-drift {
					0% { transform: translate(0, 0) scale(1); opacity: 0.4; }
					100% { transform: translate(30px, -40px) scale(1.2); opacity: 0.2; }
				}
				@keyframes neow-pulse {
					0%, 100% { opacity: 0.15; transform: translate(-50%, -50%) scale(1); }
					50% { opacity: 0.3; transform: translate(-50%, -50%) scale(1.15); }
				}
				@keyframes neow-title-glow {
					0%, 100% { text-shadow: 0 0 30px rgba(108,92,231,0.5), 0 0 60px rgba(108,92,231,0.2); }
					50% { text-shadow: 0 0 50px rgba(108,92,231,0.7), 0 0 100px rgba(108,92,231,0.3); }
				}
			`}</style>

			{/* Title */}
			<motion.h2
				initial={{ opacity: 0, y: -20 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
				style={{
					fontSize: "clamp(2rem, 5vw, 3rem)",
					fontWeight: 800,
					color: "var(--text-bright)",
					letterSpacing: "0.08em",
					animation: "neow-title-glow 4s ease-in-out infinite",
					margin: 0,
					position: "relative",
					zIndex: 1,
				}}
			>
				{tUi("neowLament")}
			</motion.h2>

			{/* Subtitle */}
			<motion.p
				initial={{ opacity: 0 }}
				animate={{ opacity: 1 }}
				transition={{ delay: 0.3, duration: 0.6 }}
				style={{
					color: "var(--text-dim)",
					maxWidth: 420,
					textAlign: "center",
					fontSize: "0.95rem",
					lineHeight: 1.6,
					position: "relative",
					zIndex: 1,
				}}
			>
				{tUi("neowChoose")}
			</motion.p>

			{/* Blessing cards */}
			<div
				style={{
					display: "flex",
					gap: "1rem",
					flexWrap: "wrap",
					justifyContent: "center",
					maxWidth: 700,
					position: "relative",
					zIndex: 1,
				}}
			>
				{NEOW_BLESSINGS.map((b, i) => (
					<BlessingCard
						key={b.id}
						blessing={b}
						index={i}
						icon={blessingIcons[b.id] ?? "✦"}
						onChoose={() => dispatch({ type: "chooseNeowBlessing", index: i })}
					/>
				))}
			</div>
		</div>
	);
}

function BlessingCard({
	blessing,
	index,
	icon,
	onChoose,
}: {
	blessing: (typeof NEOW_BLESSINGS)[number];
	index: number;
	icon: string;
	onChoose: () => void;
}) {
	const [hovered, setHovered] = useState(false);
	const translated = tNeow(blessing.id);

	return (
		<motion.button
			type="button"
			onClick={onChoose}
			onMouseEnter={() => setHovered(true)}
			onMouseLeave={() => setHovered(false)}
			initial={{ opacity: 0, y: 40, scale: 0.9 }}
			animate={{ opacity: 1, y: 0, scale: 1 }}
			transition={{
				delay: 0.5 + index * 0.12,
				duration: 0.6,
				ease: [0.16, 1, 0.3, 1],
			}}
			whileHover={{ scale: 1.05, y: -4 }}
			whileTap={{ scale: 0.97 }}
			style={{
				padding: "1.5rem 1.25rem",
				minWidth: 145,
				maxWidth: 165,
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				gap: "0.75rem",
				background: hovered
					? "linear-gradient(180deg, var(--bg-card-hover) 0%, var(--bg-glass) 100%)"
					: "var(--bg-glass)",
				backdropFilter: "blur(12px)",
				border: `1.5px solid ${hovered ? "rgba(108, 92, 231, 0.6)" : "var(--border)"}`,
				borderRadius: 16,
				cursor: "pointer",
				position: "relative",
				overflow: "hidden",
				transition: "border-color 0.3s, box-shadow 0.3s, background 0.3s",
				boxShadow: hovered
					? "0 0 30px rgba(108,92,231,0.25), 0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)"
					: "var(--shadow-md), inset 0 1px 0 rgba(255,255,255,0.03)",
				fontFamily: "inherit",
			}}
		>
			{/* Top accent line */}
			<div
				style={{
					position: "absolute",
					top: 0,
					left: "10%",
					right: "10%",
					height: 2,
					background: hovered
						? "linear-gradient(90deg, transparent, rgba(108,92,231,0.8), transparent)"
						: "linear-gradient(90deg, transparent, rgba(108,92,231,0.3), transparent)",
					transition: "background 0.3s",
				}}
			/>

			{/* Icon */}
			<div
				style={{
					fontSize: "1.5rem",
					filter: hovered ? "drop-shadow(0 0 8px rgba(108,92,231,0.6))" : "none",
					transition: "filter 0.3s",
				}}
			>
				{icon}
			</div>

			{/* Label */}
			<strong
				style={{
					fontSize: "0.9rem",
					fontWeight: 700,
					color: hovered ? "var(--text-bright)" : "var(--text)",
					transition: "color 0.3s",
					letterSpacing: "0.02em",
				}}
			>
				{translated?.label ?? blessing.label}
			</strong>

			{/* Description */}
			<span
				style={{
					fontSize: "0.75rem",
					color: "var(--text-dim)",
					lineHeight: 1.5,
					textAlign: "center",
				}}
			>
				{translated?.description ?? blessing.description}
			</span>
		</motion.button>
	);
}
