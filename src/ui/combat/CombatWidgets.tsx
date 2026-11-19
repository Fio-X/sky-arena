import { motion } from "framer-motion";
import { getPower } from "../../engine/content/loader";
import type { PowerInstance } from "../../engine/core/types";
import { tPower } from "../../i18n";

export function BlockBadge({ value }: { value: number }) {
	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				gap: "0.25rem",
				color: "var(--accent-cyan)",
				fontWeight: 700,
				fontSize: "0.9rem",
			}}
		>
			<svg
				width={18}
				height={18}
				viewBox="0 0 24 24"
				fill="currentColor"
				role="img"
				aria-label="block"
			>
				<path d="M12 2L3 9v6c0 5.55 3.84 9.74 9 11 5.16-1.26 9-5.45 9-11V9l-9-7z" />
			</svg>
			{value}
		</div>
	);
}

export function PowerList({ powers }: { powers: PowerInstance[] }) {
	return (
		<div
			style={{
				display: "flex",
				gap: "0.25rem",
				flexWrap: "wrap",
				maxWidth: 240,
			}}
		>
			{powers.map((p) => {
				const def = getPower(p.id);
				const isBuff = def?.kind === "buff" || p.amount > 0;
				const color = isBuff ? "var(--accent-blue)" : "var(--accent)";
				return (
					<span
						key={p.id}
						style={{
							padding: "2px 8px",
							background: `${isBuff ? "rgba(108,92,231,0.15)" : "rgba(255,60,111,0.15)"}`,
							border: `1px solid ${color}44`,
							borderRadius: 12,
							fontSize: "0.65rem",
							color,
							fontWeight: 600,
							backdropFilter: "blur(4px)",
						}}
						title={def?.text ?? p.id}
					>
						{tPower(p.id, def?.name ?? p.id)} {p.amount}
					</span>
				);
			})}
		</div>
	);
}

export function HpBar({ current, max }: { current: number; max: number }) {
	const pct = Math.max(0, (current / max) * 100);
	const isLow = pct < 30;
	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				gap: "0.375rem",
				justifyContent: "center",
			}}
		>
			<div
				style={{
					width: 110,
					height: 8,
					background: "var(--hp-bg)",
					borderRadius: 4,
					overflow: "hidden",
					boxShadow: "inset 0 1px 3px rgba(0,0,0,0.5)",
				}}
			>
				<motion.div
					initial={false}
					animate={{ width: `${pct}%` }}
					transition={{ duration: 0.4, ease: "easeOut" }}
					style={{
						height: "100%",
						background: isLow
							? "linear-gradient(90deg, #ff4444, #ff6666)"
							: "linear-gradient(90deg, #e53170, #ff6b8a)",
						borderRadius: 4,
						boxShadow: isLow ? "0 0 8px rgba(255,68,68,0.5)" : "none",
					}}
				/>
			</div>
			<span
				style={{
					fontSize: "0.75rem",
					fontWeight: 600,
					minWidth: "3em",
					textAlign: "right" as const,
					color: isLow ? "var(--accent)" : "var(--text-dim)",
				}}
			>
				{current}/{max}
			</span>
		</div>
	);
}

export function EnergyOrb({ current, max }: { current: number; max: number }) {
	const hasEnergy = current > 0;
	return (
		<motion.div
			animate={
				hasEnergy
					? {
							boxShadow: [
								"0 0 12px rgba(255,200,48,0.3), inset 0 0 8px rgba(255,200,48,0.1)",
								"0 0 20px rgba(255,200,48,0.5), inset 0 0 12px rgba(255,200,48,0.2)",
								"0 0 12px rgba(255,200,48,0.3), inset 0 0 8px rgba(255,200,48,0.1)",
							],
						}
					: {}
			}
			transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY }}
			style={{
				width: 56,
				height: 56,
				borderRadius: "50%",
				border: `3px solid ${hasEnergy ? "var(--energy)" : "var(--border)"}`,
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				fontWeight: 800,
				fontSize: "1.2rem",
				color: hasEnergy ? "var(--energy)" : "var(--text-dim)",
				background: "radial-gradient(circle at 40% 35%, var(--bg-card-hover), var(--bg-card))",
				flexShrink: 0,
				transition: "border-color 0.3s, color 0.3s",
			}}
		>
			{current}/{max}
		</motion.div>
	);
}
