import { useState } from "react";
import { useGameStore } from "./store/gameStore";
import { CardSelectScreen } from "./ui/combat/CardSelectScreen";
import { CombatScreen } from "./ui/combat/CombatScreen";
import { RewardScreen } from "./ui/combat/RewardScreen";
import { BossRewardScreen } from "./ui/common/BossRewardScreen";
import { EventScreen } from "./ui/common/EventScreen";
import { Hud } from "./ui/common/Hud";
import { NeowScreen } from "./ui/common/NeowScreen";
import { RestScreen } from "./ui/common/RestScreen";
import { ShopScreen } from "./ui/common/ShopScreen";
import { MapScreen } from "./ui/map/MapScreen";

export default function App() {
	const state = useGameStore((s) => s.state);

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

	return (
		<div
			style={{
				height: "100vh",
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				justifyContent: "center",
				gap: "1rem",
			}}
		>
			<h1 style={{ color: victory ? "var(--accent-green)" : "var(--accent)" }}>
				{victory ? "Victory!" : "Defeat"}
			</h1>
			<p>Floor reached: {state?.floor ?? 0}</p>
			<button type="button" onClick={() => startGame(BigInt(Date.now()), "IRONCLAD")}>
				New Game
			</button>
		</div>
	);
}

function TitleScreen() {
	const startGame = useGameStore((s) => s.startGame);
	const [seedInput, setSeedInput] = useState("42");

	const seed = (() => {
		const n = Number.parseInt(seedInput, 10);
		return Number.isFinite(n) && n >= 0 ? BigInt(n) : null;
	})();

	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				justifyContent: "center",
				height: "100vh",
				gap: "1rem",
			}}
		>
			<h1>Slay the Spire</h1>
			<p style={{ color: "var(--text-dim)" }}>Choose your character</p>
			<div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
				<label style={{ color: "var(--text-dim)", fontSize: "0.875rem" }}>
					Seed:
					<input
						type="text"
						value={seedInput}
						onChange={(e) => setSeedInput(e.target.value)}
						style={{
							marginLeft: "0.5rem",
							width: 100,
							padding: "0.375rem 0.5rem",
							background: "var(--bg-card)",
							border: "1px solid var(--border)",
							borderRadius: 4,
							color: "var(--text)",
							fontSize: "0.875rem",
						}}
					/>
				</label>
				<button
					type="button"
					onClick={() => setSeedInput(String(Math.floor(Math.random() * 1_000_000)))}
					style={{ fontSize: "0.75rem", padding: "0.375rem 0.5rem" }}
				>
					Random
				</button>
			</div>
			<div style={{ display: "flex", gap: "0.5rem" }}>
				<button
					type="button"
					disabled={seed === null}
					onClick={() => seed !== null && startGame(seed, "IRONCLAD")}
				>
					Ironclad
				</button>
			</div>
		</div>
	);
}
