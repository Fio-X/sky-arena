import { getRelic } from "../../engine/content/loader";
import { getLocale, tRelic } from "../../i18n";
import { useGameStore } from "../../store/gameStore";

const button = (color: string) => ({
	padding: "0.6rem 1.25rem",
	background: `${color}26`,
	color: "#fff",
	border: `1px solid ${color}`,
	borderRadius: 10,
	fontWeight: 600,
	cursor: "pointer",
});

/** Reward-screen rows for the Emerald Key, and for the chest relic / Sapphire Key pair (one or the other). */
export function KeyRewards() {
	const state = useGameStore((s) => s.state);
	const dispatch = useGameStore((s) => s.dispatch);
	if (state?.phase.type !== "reward") return null;
	const { emeraldKey, sapphireKey, chestRelic } = state.phase;
	if (!emeraldKey && !sapphireKey && !chestRelic) return null;
	const zh = getLocale() === "zh";
	const relicName = chestRelic ? tRelic(chestRelic, getRelic(chestRelic)?.name ?? chestRelic) : "";

	return (
		<div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", justifyContent: "center" }}>
			{chestRelic && (
				<button
					type="button"
					style={button("#f1c40f")}
					title={getRelic(chestRelic)?.text}
					onClick={() => dispatch({ type: "takeChestRelic" })}
				>
					{zh ? `获得遗物：${relicName}` : `Take relic: ${relicName}`}
				</button>
			)}
			{sapphireKey && (
				<button
					type="button"
					style={button("#3498db")}
					onClick={() => dispatch({ type: "takeKey", key: "sapphire" })}
				>
					{zh ? "🔷 蓝宝石钥匙（放弃遗物）" : "🔷 Sapphire Key (instead of the relic)"}
				</button>
			)}
			{emeraldKey && (
				<button
					type="button"
					style={button("#2ecc71")}
					onClick={() => dispatch({ type: "takeKey", key: "emerald" })}
				>
					{zh ? "🟩 绿宝石钥匙" : "🟩 Emerald Key"}
				</button>
			)}
		</div>
	);
}
