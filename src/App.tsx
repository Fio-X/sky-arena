import { useEffect, useState } from "react";
import { tUi, tUiFmt } from "./i18n";
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
				{victory ? tUi("victory") : tUi("defeat")}
			</h1>
			<p>{tUiFmt("floorReached", String(state?.floor ?? 0))}</p>
			<button type="button" onClick={() => startGame(BigInt(Date.now()), "IRONCLAD")}>
				{tUi("newGame")}
			</button>
		</div>
	);
}
