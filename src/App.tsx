import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { tUi, tUiFmt } from "./i18n";
import { useGameStore } from "./store/gameStore";
import { CardSelectScreen } from "./ui/combat/CardSelectScreen";
import { CombatScreen } from "./ui/combat/CombatScreen";
import { RewardScreen } from "./ui/combat/RewardScreen";
import { BossRewardScreen } from "./ui/common/BossRewardScreen";
import { DeckSelectScreen } from "./ui/common/DeckSelectScreen";
import { EventScreen } from "./ui/common/EventScreen";
import { Hud } from "./ui/common/Hud";
import { NeowScreen } from "./ui/common/NeowScreen";
import { RestScreen } from "./ui/common/RestScreen";
import { ShopScreen } from "./ui/common/ShopScreen";
import { TitleScreen } from "./ui/common/TitleScreen";
import { MapScreen } from "./ui/map/MapScreen";

export default function App() {
	const state = useGameStore((s) => s.state);
	const [, forceUpdate] = useState(0);
	useEffect(() => {
		const handler = () => forceUpdate((n) => n + 1);
		window.addEventListener("locale-changed", handler);
		return () => window.removeEventListener("locale-changed", handler);
	}, []);

	if (!state) {
		return <TitleScreen />;
	}

	return (
		<div>
			<Hud />
			<Screen phase={state.phase.type} />
		</div>
	);
}

function Screen({ phase }: { phase: string }) {
	switch (phase) {
		case "neow":
			return <NeowScreen />;
		case "map":
			return <MapScreen />;
		case "combat":
			return <CombatScreen />;
		case "cardSelect":
			return <CardSelectScreen />;
		case "reward":
			return <RewardScreen />;
		case "rest":
			return <RestScreen />;
		case "shop":
			return <ShopScreen />;
		case "event":
			return <EventScreen />;
		case "bossReward":
			return <BossRewardScreen />;
		case "deckSelect":
			return <DeckSelectScreen />;
		case "gameOver":
			return <GameOverScreen />;
		default:
			return <Placeholder title={`Phase: ${phase}`} />;
	}
}

function Placeholder({ title, children }: { title: string; children?: React.ReactNode }) {
	return (
		<div
			style={{
				height: "calc(100vh - 36px)",
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				justifyContent: "center",
				gap: "1rem",
			}}
		>
			<h2>{title}</h2>
			{children}
		</div>
	);
}

function GameOverScreen() {
	const state = useGameStore((s) => s.state);
	const startGame = useGameStore((s) => s.startGame);
	const victory = state?.phase.type === "gameOver" && state.phase.victory;
	const [btnHovered, setBtnHovered] = useState(false);

	const accentColor = victory ? "var(--accent-green)" : "var(--accent)";
	const accentRgb = victory ? "0, 232, 143" : "255, 60, 111";
	const secondaryRgb = victory ? "255, 200, 48" : "108, 92, 231";

	return (
		<div
			style={{
				height: "calc(100vh - 36px)",
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				justifyContent: "center",
				gap: "1.5rem",
				position: "relative",
				overflow: "hidden",
			}}
		>
			{/* Ambient glow orbs */}
			<div
				style={{
					position: "absolute",
					width: 400,
					height: 400,
					borderRadius: "50%",
					top: "20%",
					left: "30%",
					background: `rgba(${accentRgb}, 0.12)`,
					filter: "blur(80px)",
					pointerEvents: "none",
					animation: "gameover-pulse 5s ease-in-out infinite",
				}}
			/>
			<div
				style={{
					position: "absolute",
					width: 250,
					height: 250,
					borderRadius: "50%",
					bottom: "15%",
					right: "20%",
					background: `rgba(${secondaryRgb}, 0.10)`,
					filter: "blur(60px)",
					pointerEvents: "none",
					animation: "gameover-pulse 7s ease-in-out infinite alternate-reverse",
				}}
			/>

			<style>{`
				@keyframes gameover-pulse {
					0%, 100% { opacity: 0.5; transform: scale(1); }
					50% { opacity: 0.8; transform: scale(1.1); }
				}
				@keyframes gameover-title-glow {
					0%, 100% { text-shadow: 0 0 30px rgba(${accentRgb}, 0.5), 0 0 60px rgba(${accentRgb}, 0.2); }
					50% { text-shadow: 0 0 50px rgba(${accentRgb}, 0.7), 0 0 100px rgba(${accentRgb}, 0.3); }
				}
			`}</style>

			{/* Title */}
			<motion.h1
				initial={{ opacity: 0, scale: 0.8, y: -20 }}
				animate={{ opacity: 1, scale: 1, y: 0 }}
				transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
				style={{
					fontSize: "clamp(3rem, 8vw, 5rem)",
					fontWeight: 900,
					color: accentColor,
					letterSpacing: "0.06em",
					animation: `gameover-title-glow 3s ease-in-out infinite`,
					margin: 0,
					position: "relative",
					zIndex: 1,
				}}
			>
				{victory ? tUi("victory") : tUi("defeat")}
			</motion.h1>

			{/* Stats panel */}
			<motion.div
				initial={{ opacity: 0, y: 20 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ delay: 0.3, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
				style={{
					background: "var(--bg-glass)",
					backdropFilter: "blur(12px)",
					border: `1.5px solid ${victory ? "rgba(0,232,143,0.3)" : "rgba(255,60,111,0.3)"}`,
					borderRadius: 16,
					padding: "1.5rem 2.5rem",
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
					gap: "0.75rem",
					boxShadow: `0 0 30px rgba(${accentRgb}, 0.1), var(--shadow-lg)`,
					position: "relative",
					zIndex: 1,
				}}
			>
				{/* Top accent */}
				<div
					style={{
						position: "absolute",
						top: 0,
						left: "15%",
						right: "15%",
						height: 2,
						background: `linear-gradient(90deg, transparent, ${accentColor}, transparent)`,
					}}
				/>

				<p
					style={{
						fontSize: "1.1rem",
						fontWeight: 600,
						color: "var(--text)",
						margin: 0,
					}}
				>
					{tUiFmt("floorReached", String(state?.floor ?? 0))}
				</p>

				{state && (
					<div
						style={{
							display: "flex",
							gap: "2rem",
							fontSize: "0.85rem",
							color: "var(--text-dim)",
						}}
					>
						<span>
							<span style={{ color: "var(--accent-gold)", fontWeight: 600 }}>{state.gold}</span>{" "}
							Gold
						</span>
						<span>
							<span style={{ color: "var(--accent)", fontWeight: 600 }}>{state.maxHp}</span> Max HP
						</span>
					</div>
				)}
			</motion.div>

			{/* New Game button */}
			<motion.button
				type="button"
				onClick={() => startGame(BigInt(Date.now()), "IRONCLAD")}
				onMouseEnter={() => setBtnHovered(true)}
				onMouseLeave={() => setBtnHovered(false)}
				initial={{ opacity: 0, y: 20 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ delay: 0.6, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
				whileHover={{ scale: 1.05 }}
				whileTap={{ scale: 0.96 }}
				style={{
					padding: "0.75rem 2.5rem",
					fontSize: "1rem",
					fontWeight: 700,
					letterSpacing: "0.04em",
					background: btnHovered
						? `linear-gradient(135deg, rgba(${accentRgb}, 0.3), rgba(${secondaryRgb}, 0.2))`
						: "var(--bg-card)",
					border: `1.5px solid ${btnHovered ? accentColor : "var(--border)"}`,
					borderRadius: 12,
					color: btnHovered ? accentColor : "var(--text)",
					cursor: "pointer",
					position: "relative",
					zIndex: 1,
					transition: "background 0.3s, border-color 0.3s, color 0.3s, box-shadow 0.3s",
					boxShadow: btnHovered
						? `0 0 25px rgba(${accentRgb}, 0.25), var(--shadow-md)`
						: "var(--shadow-md)",
					fontFamily: "inherit",
				}}
			>
				{tUi("newGame")}
			</motion.button>
		</div>
	);
}
