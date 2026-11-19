import { motion, AnimatePresence } from "framer-motion";
import type { OrbInstance } from "../../engine/core/types";

const ORB_SIZE = 48;

const ORB_COLORS: Record<string, { main: string; glow: string; icon: string }> = {
	lightning: { main: "var(--orb-lightning)", glow: "var(--orb-lightning-glow)", icon: "⚡" },
	frost: { main: "var(--orb-frost)", glow: "var(--orb-frost-glow)", icon: "❄" },
	dark: { main: "var(--orb-dark)", glow: "var(--orb-dark-glow)", icon: "◉" },
	plasma: { main: "var(--orb-plasma)", glow: "var(--orb-plasma-glow)", icon: "✦" },
	empty: { main: "var(--orb-empty)", glow: "transparent", icon: "" },
};

export function OrbSlots({ orbs, slots }: { orbs: OrbInstance[]; slots: number }) {
	const display: (OrbInstance | null)[] = [];
	for (let i = 0; i < slots; i++) {
		display.push(i < orbs.length ? (orbs[i] ?? null) : null);
	}

	if (slots === 0) return null;

	return (
		<div
			style={{
				display: "flex",
				gap: 8,
				alignItems: "center",
				justifyContent: "center",
				padding: "4px 0",
			}}
		>
			<AnimatePresence mode="popLayout">
				{display.map((orb, i) => (
					<motion.div
						key={orb ? `orb-${i}-${orb.type}` : `empty-${i}`}
						initial={{ scale: 0, opacity: 0 }}
						animate={{ scale: 1, opacity: 1 }}
						exit={{ scale: 0, opacity: 0 }}
						transition={{ type: "spring", stiffness: 400, damping: 25 }}
					>
						{orb ? <OrbBall orb={orb} index={i} /> : <EmptySlot />}
					</motion.div>
				))}
			</AnimatePresence>
		</div>
	);
}

function OrbBall({ orb, index }: { orb: OrbInstance; index: number }) {
	const colors = ORB_COLORS[orb.type] ?? { main: "var(--orb-empty)", glow: "transparent", icon: "" };
	const passiveVal = orb.type === "dark" ? orb.passive : null;

	return (
		<div
			style={{
				width: ORB_SIZE,
				height: ORB_SIZE,
				borderRadius: "50%",
				position: "relative",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				cursor: "default",
			}}
			title={`${orb.type} — Passive: ${orb.passive}, Evoke: ${orb.evoke}`}
		>
			{/* Outer glow ring */}
			<div
				style={{
					position: "absolute",
					inset: -4,
					borderRadius: "50%",
					background: `radial-gradient(circle, ${colors.glow}, transparent 70%)`,
					animation: `orb-idle 2.5s ease-in-out infinite`,
					animationDelay: `${index * 0.3}s`,
					opacity: 0.7,
				}}
			/>
			{/* Core */}
			<div
				style={{
					width: ORB_SIZE - 4,
					height: ORB_SIZE - 4,
					borderRadius: "50%",
					background: `radial-gradient(circle at 35% 35%, ${colors.main}cc, ${colors.main}44 70%, transparent)`,
					border: `2px solid ${colors.main}88`,
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					fontSize: orb.type === "dark" ? "0.7rem" : "1.1rem",
					color: colors.main,
					fontWeight: "bold",
					textShadow: `0 0 8px ${colors.glow}`,
					position: "relative",
					zIndex: 1,
					boxShadow: `inset 0 0 12px ${colors.glow}, 0 0 8px ${colors.glow}`,
					animation:
						orb.type === "lightning"
							? "orb-lightning 2s infinite"
							: "orb-idle 2.5s ease-in-out infinite",
					animationDelay: `${index * 0.3}s`,
				}}
			>
				{passiveVal !== null ? passiveVal : colors.icon}
			</div>
		</div>
	);
}

function EmptySlot() {
	return (
		<div
			style={{
				width: ORB_SIZE,
				height: ORB_SIZE,
				borderRadius: "50%",
				border: "2px dashed var(--border)",
				background: "rgba(255,255,255,0.02)",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
			}}
		/>
	);
}
