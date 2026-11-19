import { motion } from "framer-motion";
import { useState } from "react";
import { tUi } from "../../i18n";
import { useGameStore } from "../../store/gameStore";
import { LanguageToggle } from "./LanguageToggle";

type CharacterKey = "IRONCLAD" | "SILENT" | "DEFECT" | "WATCHER";

interface CharacterDef {
	key: CharacterKey;
	nameKey: "ironclad" | "silent" | "defect" | "watcher";
	enName: string;
	color: string;
	icon: React.ReactNode;
	image: string;
}

const svgBase = {
	viewBox: "0 0 48 48",
	width: 48,
	height: 48,
	fill: "none",
	stroke: "currentColor",
	strokeWidth: 2.5,
	strokeLinecap: "round" as const,
	strokeLinejoin: "round" as const,
	role: "img" as const,
};

const swordIcon = (
	<svg {...svgBase} aria-label="Sword">
		<line x1="10" y1="38" x2="34" y2="14" />
		<line x1="30" y1="10" x2="38" y2="18" />
		<line x1="34" y1="14" x2="38" y2="10" />
		<line x1="14" y1="30" x2="22" y2="38" />
		<line x1="10" y1="38" x2="6" y2="42" />
	</svg>
);

const daggerIcon = (
	<svg {...svgBase} aria-label="Dagger">
		<line x1="14" y1="34" x2="34" y2="14" />
		<path d="M34 14 L38 10 L40 14 L36 16 Z" />
		<line x1="20" y1="28" x2="16" y2="32" />
		<circle cx="12" cy="36" r="3" />
	</svg>
);

const orbIcon = (
	<svg {...svgBase} aria-label="Orb">
		<circle cx="24" cy="24" r="12" />
		<circle cx="24" cy="24" r="5" />
		<line x1="24" y1="12" x2="24" y2="6" />
		<line x1="24" y1="42" x2="24" y2="36" />
		<line x1="12" y1="24" x2="6" y2="24" />
		<line x1="42" y1="24" x2="36" y2="24" />
	</svg>
);

const lotusIcon = (
	<svg {...svgBase} aria-label="Lotus">
		<path d="M24 10 C24 10 18 18 18 26 C18 30 20 32 24 32 C28 32 30 30 30 26 C30 18 24 10 24 10Z" />
		<path d="M24 32 C20 32 14 30 10 26 C8 24 10 20 14 22 C17 23 20 28 24 32Z" />
		<path d="M24 32 C28 32 34 30 38 26 C40 24 38 20 34 22 C31 23 28 28 24 32Z" />
		<line x1="24" y1="32" x2="24" y2="42" />
	</svg>
);

/* biome-ignore format: compact data table */
const characters: CharacterDef[] = [
	{ key: "IRONCLAD", nameKey: "ironclad", enName: "Ironclad", color: "var(--ironclad)", icon: swordIcon, image: "characters/ironclad.png" },
	{ key: "SILENT", nameKey: "silent", enName: "Silent", color: "var(--silent)", icon: daggerIcon, image: "characters/silent.png" },
	{ key: "DEFECT", nameKey: "defect", enName: "Defect", color: "var(--defect)", icon: orbIcon, image: "characters/defect.png" },
	{ key: "WATCHER", nameKey: "watcher", enName: "Watcher", color: "var(--watcher)", icon: lotusIcon, image: "characters/watcher.png" },
];

const bgStyle: React.CSSProperties = {
	position: "fixed",
	inset: 0,
	background: `
		radial-gradient(ellipse 80% 60% at 20% 80%, rgba(229,49,112,0.12) 0%, transparent 60%),
		radial-gradient(ellipse 60% 50% at 80% 20%, rgba(0,212,255,0.10) 0%, transparent 60%),
		radial-gradient(ellipse 70% 70% at 50% 50%, rgba(44,182,125,0.06) 0%, transparent 50%),
		var(--bg)
	`,
	overflow: "hidden",
};

const particleBaseStyle: React.CSSProperties = {
	position: "absolute",
	borderRadius: "50%",
	background: "rgba(108, 92, 231, 0.3)",
	filter: "blur(40px)",
	animation: "title-float 12s ease-in-out infinite alternate",
};

export function TitleScreen() {
	const startGame = useGameStore((s) => s.startGame);
	const [seedInput, setSeedInput] = useState("42");

	const seed = (() => {
		const n = Number.parseInt(seedInput, 10);
		return Number.isFinite(n) && n >= 0 ? BigInt(n) : null;
	})();

	return (
		<div style={bgStyle}>
			{/* Animated ambient particles (CSS only) */}
			<style>{`
				@keyframes title-float {
					0% { transform: translate(0, 0) scale(1); opacity: 0.3; }
					50% { opacity: 0.6; }
					100% { transform: translate(40px, -60px) scale(1.3); opacity: 0.2; }
				}
				@keyframes title-glow {
					0%, 100% { text-shadow: 0 0 40px rgba(108,92,231,0.4), 0 0 80px rgba(108,92,231,0.15); }
					50% { text-shadow: 0 0 60px rgba(108,92,231,0.6), 0 0 120px rgba(108,92,231,0.25); }
				}
			`}</style>

			{/* biome-ignore format: ambient particles */}
			<div style={{ ...particleBaseStyle, width: 300, height: 300, top: "10%", left: "5%" }} />
			<div
				style={{
					...particleBaseStyle,
					width: 200,
					height: 200,
					top: "60%",
					right: "10%",
					background: "rgba(0,212,255,0.15)",
					animationDelay: "-4s",
					animationDuration: "15s",
				}}
			/>
			<div
				style={{
					...particleBaseStyle,
					width: 250,
					height: 250,
					bottom: "5%",
					left: "40%",
					background: "rgba(229,49,112,0.12)",
					animationDelay: "-8s",
					animationDuration: "18s",
				}}
			/>

			{/* Language toggle */}
			<div style={{ position: "absolute", top: "1.5rem", right: "1.5rem", zIndex: 10 }}>
				<LanguageToggle />
			</div>

			{/* Main content */}
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
					justifyContent: "center",
					height: "100vh",
					gap: "2rem",
					position: "relative",
					zIndex: 1,
					padding: "2rem 1rem",
				}}
			>
				{/* Title */}
				<motion.div
					initial={{ opacity: 0, y: -30 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
					style={{ textAlign: "center" }}
				>
					<h1
						style={{
							fontSize: "clamp(3rem, 8vw, 5.5rem)",
							fontWeight: 900,
							letterSpacing: "0.08em",
							color: "var(--text-bright)",
							animation: "title-glow 4s ease-in-out infinite",
							lineHeight: 1.1,
							margin: 0,
						}}
					>
						{tUi("slayTheSpire")}
					</h1>
				</motion.div>

				{/* Subtitle */}
				<motion.p
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					transition={{ delay: 0.4, duration: 0.6 }}
					style={{
						color: "var(--text-dim)",
						fontSize: "clamp(0.9rem, 2vw, 1.1rem)",
						fontWeight: 500,
						letterSpacing: "0.15em",
						textTransform: "uppercase",
						margin: 0,
					}}
				>
					{tUi("chooseCharacter")}
				</motion.p>

				{/* Seed input */}
				<motion.div
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					transition={{ delay: 0.6, duration: 0.5 }}
					style={{
						display: "flex",
						alignItems: "center",
						gap: "0.5rem",
						background: "var(--bg-glass)",
						padding: "0.5rem 1rem",
						borderRadius: 12,
						border: "1px solid var(--border)",
						backdropFilter: "blur(12px)",
					}}
				>
					<span
						style={{
							color: "var(--text-dim)",
							fontSize: "0.8rem",
							fontWeight: 600,
							letterSpacing: "0.05em",
						}}
					>
						{tUi("seed")}
					</span>
					<input
						type="text"
						value={seedInput}
						onChange={(e) => setSeedInput(e.target.value)}
						style={{
							width: 100,
							padding: "0.375rem 0.625rem",
							background: "var(--bg-card)",
							border: "1px solid var(--border)",
							borderRadius: 6,
							color: "var(--text)",
							fontSize: "0.875rem",
							fontFamily: "'Inter', monospace",
							outline: "none",
						}}
					/>
					<button
						type="button"
						onClick={() => setSeedInput(String(Math.floor(Math.random() * 1_000_000)))}
						style={{
							fontSize: "0.75rem",
							padding: "0.375rem 0.625rem",
							background: "var(--bg-card)",
							border: "1px solid var(--border)",
							borderRadius: 6,
							color: "var(--text-dim)",
						}}
					>
						{tUi("random")}
					</button>
				</motion.div>

				{/* Character cards */}
				<div
					style={{
						display: "flex",
						gap: "clamp(0.75rem, 2vw, 1.5rem)",
						flexWrap: "wrap",
						justifyContent: "center",
					}}
				>
					{characters.map((char, i) => (
						<CharacterCard
							key={char.key}
							char={char}
							index={i}
							disabled={seed === null}
							onClick={() => seed !== null && startGame(seed, char.key)}
						/>
					))}
				</div>
			</div>
		</div>
	);
}

function CharacterCard({
	char,
	index,
	disabled,
	onClick,
}: {
	char: CharacterDef;
	index: number;
	disabled: boolean;
	onClick: () => void;
}) {
	const [hovered, setHovered] = useState(false);
	const active = !disabled && hovered;

	return (
		<motion.button
			type="button"
			disabled={disabled}
			onClick={onClick}
			onMouseEnter={() => setHovered(true)}
			onMouseLeave={() => setHovered(false)}
			initial={{ opacity: 0, y: 50, scale: 0.9 }}
			animate={{ opacity: 1, y: 0, scale: 1 }}
			transition={{
				delay: 0.8 + index * 0.15,
				duration: 0.6,
				ease: [0.16, 1, 0.3, 1],
			}}
			whileHover={disabled ? undefined : { scale: 1.06, y: -4 }}
			whileTap={disabled ? undefined : { scale: 0.97 }}
			style={{
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				justifyContent: "center",
				gap: "0.75rem",
				width: "clamp(140px, 22vw, 190px)",
				padding: "2rem 1.25rem",
				background: active
					? "linear-gradient(180deg, var(--bg-card-hover) 0%, var(--bg-card) 100%)"
					: "var(--bg-card)",
				border: `1.5px solid ${active ? char.color : "var(--border)"}`,
				borderRadius: 16,
				cursor: disabled ? "default" : "pointer",
				position: "relative",
				overflow: "hidden",
				transition: "border-color 0.3s, box-shadow 0.3s, background 0.3s",
				boxShadow: active
					? `0 0 30px ${char.color}33, 0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)`
					: "0 4px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.03)",
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
					background: active
						? `linear-gradient(90deg, transparent, ${char.color}, transparent)`
						: `linear-gradient(90deg, transparent, ${char.color}44, transparent)`,
					transition: "background 0.3s",
				}}
			/>

			{/* Character portrait */}
			<div
				style={{
					transition: "filter 0.3s",
					filter: active ? `drop-shadow(0 0 8px ${char.color}66)` : "none",
					opacity: disabled ? 0.35 : 1,
				}}
			>
				<img
					src={`${import.meta.env.BASE_URL}${char.image}`}
					alt={char.enName}
					style={{ width: 80, height: 80, objectFit: "contain" }}
				/>
			</div>

			{/* Character name */}
			<div style={{ textAlign: "center" }}>
				<div
					style={{
						fontSize: "clamp(1rem, 2vw, 1.2rem)",
						fontWeight: 700,
						color: active ? char.color : "var(--text)",
						transition: "color 0.3s",
						letterSpacing: "0.03em",
						opacity: disabled ? 0.35 : 1,
					}}
				>
					{tUi(char.nameKey)}
				</div>
				<div
					style={{
						fontSize: "0.7rem",
						fontWeight: 500,
						color: "var(--text-dim)",
						letterSpacing: "0.1em",
						textTransform: "uppercase",
						marginTop: 4,
						opacity: disabled ? 0.35 : 1,
					}}
				>
					{char.enName}
				</div>
			</div>
		</motion.button>
	);
}
