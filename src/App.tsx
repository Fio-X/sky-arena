import { useGameStore } from "./store/gameStore";
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
			<div style={{ display: "flex", gap: "0.5rem" }}>
				<button type="button" onClick={() => startGame(42n, "IRONCLAD")}>
					Ironclad
				</button>
			</div>
		</div>
	);
}
