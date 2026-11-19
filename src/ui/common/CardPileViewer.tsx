import { useState } from "react";
import { getCard } from "../../engine/content/loader";
import type { CardInstance } from "../../engine/core/types";
import { tCard, tCardText, tUi } from "../../i18n";
import { useGameStore } from "../../store/gameStore";

type PileType = "deck" | "draw" | "discard" | "exhaust";

export function CardPileViewer() {
	const [open, setOpen] = useState<PileType | null>(null);
	const state = useGameStore((s) => s.state);
	if (!state) return null;

	const piles: Record<PileType, { label: string; cards: CardInstance[] }> = {
		deck: { label: tUi("deck"), cards: state.deck },
		draw: { label: tUi("drawPile"), cards: state.combat?.drawPile ?? [] },
		discard: { label: tUi("discardPile"), cards: state.combat?.discardPile ?? [] },
		exhaust: { label: tUi("exhaustPile"), cards: state.combat?.exhaustPile ?? [] },
	};

	const inCombat = state.combat !== null;

	return (
		<>
			<span style={{ display: "flex", gap: "0.375rem", fontSize: "0.8rem" }}>
				<PileButton
					label={`${tUi("deck")}: ${state.deck.length}`}
					onClick={() => setOpen("deck")}
				/>
				{inCombat && (
					<>
						<PileButton
							label={`${tUi("draw")}: ${state.combat?.drawPile.length ?? 0}`}
							onClick={() => setOpen("draw")}
						/>
						<PileButton
							label={`${tUi("discard")}: ${state.combat?.discardPile.length ?? 0}`}
							onClick={() => setOpen("discard")}
						/>
						{(state.combat?.exhaustPile.length ?? 0) > 0 && (
							<PileButton
								label={`${tUi("exhaust")}: ${state.combat?.exhaustPile.length ?? 0}`}
								onClick={() => setOpen("exhaust")}
							/>
						)}
					</>
				)}
			</span>

			{open && (
				<PileModal
					title={piles[open].label}
					cards={piles[open].cards}
					// Frozen Eye: the draw pile is shown in draw order (top card first).
					inOrder={open === "draw" && state.relics.some((r) => r.id === "FROZEN_EYE")}
					onClose={() => setOpen(null)}
				/>
			)}
		</>
	);
}

function PileButton({ label, onClick }: { label: string; onClick: () => void }) {
	return (
		<button
			type="button"
			onClick={onClick}
			style={{
				padding: "0.125rem 0.375rem",
				fontSize: "0.75rem",
				color: "var(--text-dim)",
				background: "none",
				border: "1px solid var(--border)",
				borderRadius: 4,
			}}
		>
			{label}
		</button>
	);
}

function sortedByType(cards: CardInstance[]): CardInstance[] {
	return [...cards].sort((a, b) => {
		const da = getCard(a.id);
		const db = getCard(b.id);
		const typeOrder = { power: 0, skill: 1, attack: 2, status: 3, curse: 4 };
		const ta = typeOrder[(da?.type ?? "status") as keyof typeof typeOrder] ?? 5;
		const tb = typeOrder[(db?.type ?? "status") as keyof typeof typeOrder] ?? 5;
		if (ta !== tb) return ta - tb;
		return (da?.name ?? a.id).localeCompare(db?.name ?? b.id);
	});
}

function PileModal({
	title,
	cards,
	inOrder,
	onClose,
}: {
	title: string;
	cards: CardInstance[];
	inOrder: boolean;
	onClose: () => void;
}) {
	const sorted = inOrder ? [...cards].reverse() : sortedByType(cards);

	return (
		<div
			role="dialog"
			onClick={onClose}
			onKeyDown={(e) => e.key === "Escape" && onClose()}
			style={{
				position: "fixed",
				inset: 0,
				background: "rgba(0,0,0,0.7)",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				zIndex: 100,
			}}
		>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: modal content stops click propagation */}
			<div
				onClick={(e) => e.stopPropagation()}
				onKeyDown={() => {}}
				style={{
					background: "var(--bg-panel)",
					border: "1px solid var(--border)",
					borderRadius: 8,
					padding: "1rem",
					maxWidth: 600,
					maxHeight: "80vh",
					overflow: "auto",
					minWidth: 300,
				}}
			>
				<div
					style={{
						display: "flex",
						justifyContent: "space-between",
						alignItems: "center",
						marginBottom: "0.75rem",
					}}
				>
					<h3>
						{title} ({cards.length})
					</h3>
					<button type="button" onClick={onClose} style={{ fontSize: "0.75rem" }}>
						{tUi("close")}
					</button>
				</div>
				{cards.length === 0 ? (
					<p style={{ color: "var(--text-dim)" }}>{tUi("empty")}</p>
				) : (
					<div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem" }}>
						{sorted.map((c) => (
							<MiniCard key={c.uniqueId} card={c} />
						))}
					</div>
				)}
			</div>
		</div>
	);
}

function MiniCard({ card }: { card: CardInstance }) {
	const def = getCard(card.id);
	const name = tCard(card.id, def?.name ?? card.id);
	const cost = card.freeToPlay ? 0 : (card.costOverride ?? def?.cost ?? card.costForTurn);

	const typeColor =
		def?.type === "attack"
			? "var(--accent)"
			: def?.type === "skill"
				? "var(--accent-blue)"
				: def?.type === "power"
					? "var(--accent-gold)"
					: "var(--text-dim)";

	const typeLabel =
		def?.type === "attack"
			? tUi("cardTypeAttack")
			: def?.type === "skill"
				? tUi("cardTypeSkill")
				: def?.type === "power"
					? tUi("cardTypePower")
					: "";
	const tooltip = tCardText(card.id, def?.text ?? "");

	return (
		<div
			title={tooltip}
			style={{
				padding: "0.25rem 0.5rem",
				background: "var(--bg-card)",
				border: "1px solid var(--border)",
				borderRadius: 4,
				fontSize: "0.75rem",
				display: "flex",
				gap: "0.375rem",
				alignItems: "center",
			}}
		>
			<span style={{ color: "var(--energy)", fontWeight: "bold" }}>{cost}</span>
			<span style={{ fontWeight: "bold" }}>
				{name}
				{card.upgraded ? "+" : ""}
			</span>
			<span style={{ color: typeColor, fontSize: "0.6rem", textTransform: "uppercase" }}>
				{typeLabel}
			</span>
		</div>
	);
}
