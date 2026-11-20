import { motion } from "framer-motion";
import { useState } from "react";
import { getCard } from "../../engine/content/loader";
import { eligibleIndices } from "../../engine/content/relicsRun2";
import type { DeckSelectTask } from "../../engine/core/types";
import { getLocale, tCard, tCardText } from "../../i18n";
import { useGameStore } from "../../store/gameStore";
import { cardTypeLabel } from "../cardTextUtils";

const TITLES: Record<DeckSelectTask, { zh: string; en: string }> = {
	astrolabe: {
		zh: "星盘：选择 {n} 张牌变化并升级",
		en: "Astrolabe: choose {n} cards to transform and upgrade",
	},
	emptyCage: { zh: "空笼：选择 {n} 张牌移除", en: "Empty Cage: choose {n} cards to remove" },
	dollysMirror: {
		zh: "多莉之镜：选择 1 张牌复制",
		en: "Dolly's Mirror: choose a card to duplicate",
	},
	peacePipe: { zh: "和平烟斗：选择 1 张牌移除", en: "Peace Pipe: choose a card to remove" },
	remove: { zh: "选择 {n} 张牌移除", en: "Choose {n} card(s) to remove" },
	upgrade: { zh: "选择 {n} 张牌升级", en: "Choose {n} card(s) to upgrade" },
	transform: { zh: "选择 {n} 张牌变化", en: "Choose {n} card(s) to transform" },
	duplicate: { zh: "选择 {n} 张牌复制", en: "Choose {n} card(s) to duplicate" },
	bonfire: { zh: "篝火之灵：选择 1 张牌献祭", en: "Bonfire Spirits: choose a card to offer" },
	noteForYourself: {
		zh: "给自己的留言：选择 1 张牌留给下次",
		en: "Note For Yourself: choose a card to leave behind",
	},
	removeAndUpgrade: {
		zh: "选择 1 张牌移除（之后随机升级 1 张）",
		en: "Choose a card to remove (then a random card is upgraded)",
	},
};

/** Pick cards from the master deck for a relic (deckSelect phase). */
export function DeckSelectScreen() {
	const state = useGameStore((s) => s.state);
	const dispatch = useGameStore((s) => s.dispatch);
	const [selected, setSelected] = useState<number[]>([]);

	if (state?.phase.type !== "deckSelect") return null;
	const { task, count } = state.phase;
	const zh = getLocale() === "zh";
	const eligible = eligibleIndices(state, task);
	const title = (zh ? TITLES[task].zh : TITLES[task].en).replace("{n}", String(count));

	const toggle = (i: number) =>
		setSelected((sel) =>
			sel.includes(i) ? sel.filter((x) => x !== i) : sel.length < count ? [...sel, i] : sel,
		);
	const confirm = () => {
		dispatch({ type: "chooseDeckCards", indices: selected });
		setSelected([]);
	};

	return (
		<div
			style={{
				minHeight: "calc(100vh - 36px)",
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				justifyContent: "center",
				gap: "1.25rem",
				padding: "2rem 1rem",
			}}
		>
			<h2 style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--accent-cyan)" }}>{title}</h2>
			<div
				style={{
					display: "flex",
					gap: "0.6rem",
					flexWrap: "wrap",
					justifyContent: "center",
					maxWidth: 760,
				}}
			>
				{eligible.map((i) => {
					const card = state.deck[i];
					if (!card) return null;
					const def = getCard(card.id);
					const isSel = selected.includes(i);
					return (
						<motion.button
							type="button"
							key={card.uniqueId}
							onClick={() => toggle(i)}
							title={tCardText(card.id, def?.text ?? "")}
							whileHover={{ scale: 1.05 }}
							whileTap={{ scale: 0.96 }}
							style={{
								padding: "0.6rem 0.85rem",
								minWidth: 100,
								textAlign: "center",
								background: isSel ? "rgba(0,212,255,0.15)" : "var(--bg-card)",
								border: `1px solid ${isSel ? "var(--accent-cyan)" : "var(--border)"}`,
								borderRadius: 10,
								cursor: "pointer",
							}}
						>
							<div style={{ fontWeight: 600, fontSize: "0.85rem" }}>
								{tCard(card.id, def?.name ?? card.id)}
								{card.upgraded ? "+" : ""}
							</div>
							<div style={{ fontSize: "0.65rem", color: "var(--text-dim)" }}>
								{cardTypeLabel(def?.type)}
							</div>
						</motion.button>
					);
				})}
			</div>
			<div style={{ display: "flex", gap: "0.75rem" }}>
				{task === "peacePipe" && (
					<button type="button" onClick={() => dispatch({ type: "chooseDeckCards", indices: [] })}>
						{zh ? "返回" : "Back"}
					</button>
				)}
				<button type="button" disabled={selected.length !== count} onClick={confirm}>
					{zh ? `确认 (${selected.length}/${count})` : `Confirm (${selected.length}/${count})`}
				</button>
			</div>
		</div>
	);
}
