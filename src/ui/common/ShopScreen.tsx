import { useState } from "react";
import { getCard, getPotion, getRelic } from "../../engine/content/loader";
import { useGameStore } from "../../store/gameStore";

export function ShopScreen() {
	const state = useGameStore((s) => s.state);
	const dispatch = useGameStore((s) => s.dispatch);
	const [purgeMode, setPurgeMode] = useState(false);

	if (state?.phase.type !== "shop") return null;
	const shop = state.phase.shop;
	const gold = state.gold;

	if (purgeMode) {
		return (
			<PurgeView
				deck={state.deck}
				onChoose={(idx) => {
					dispatch({ type: "shopPurge", cardIndex: idx });
					setPurgeMode(false);
				}}
				onCancel={() => setPurgeMode(false)}
			/>
		);
	}

	const cardOffset = 0;
	const relicOffset = shop.cards.length;
	const potionOffset = relicOffset + shop.relics.length;

	return (
		<div
			style={{
				height: "calc(100vh - 36px)",
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				padding: "2rem 1rem",
				gap: "1.5rem",
				overflowY: "auto",
			}}
		>
			<h2>Shop</h2>
			<p style={{ color: "var(--accent-gold)" }}>Gold: {gold}</p>

			{/* Cards */}
			<Section title="Cards">
				{shop.cards.map((item, i) => {
					const def = getCard(item.cardId as string);
					return (
						<ShopButton
							key={item.cardId as string}
							label={def?.name ?? (item.cardId as string)}
							sublabel={`${def?.rarity ?? ""} ${def?.type ?? ""}`}
							price={item.price}
							sold={item.sold}
							affordable={gold >= item.price}
							onClick={() => dispatch({ type: "chooseShopItem", index: cardOffset + i })}
						/>
					);
				})}
			</Section>

			{/* Relics */}
			<Section title="Relics">
				{shop.relics.map((item, i) => {
					const def = getRelic(item.relicId as string);
					return (
						<ShopButton
							key={item.relicId as string}
							label={def?.name ?? (item.relicId as string)}
							sublabel={def?.text ?? ""}
							price={item.price}
							sold={item.sold}
							affordable={gold >= item.price}
							onClick={() => dispatch({ type: "chooseShopItem", index: relicOffset + i })}
						/>
					);
				})}
			</Section>

			{/* Potions */}
			<Section title="Potions">
				{shop.potions.map((item, i) => {
					const def = getPotion(item.potionId as string);
					return (
						<ShopButton
							key={item.potionId as string}
							label={def?.name ?? (item.potionId as string)}
							sublabel={def?.text ?? ""}
							price={item.price}
							sold={item.sold}
							affordable={gold >= item.price && state.potions.includes(null)}
							onClick={() => dispatch({ type: "chooseShopItem", index: potionOffset + i })}
						/>
					);
				})}
			</Section>

			{/* Card Removal */}
			{!shop.purgeUsed && (
				<button
					type="button"
					disabled={gold < shop.purgePrice}
					onClick={() => setPurgeMode(true)}
					style={{
						padding: "0.75rem 1.5rem",
						opacity: gold < shop.purgePrice ? 0.5 : 1,
					}}
				>
					Remove a Card — {shop.purgePrice} gold
				</button>
			)}

			<button
				type="button"
				onClick={() => dispatch({ type: "leaveShop" })}
				style={{ padding: "0.75rem 2rem", marginTop: "1rem" }}
			>
				Leave Shop
			</button>
		</div>
	);
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<div>
			<h3 style={{ fontSize: "0.875rem", color: "var(--text-dim)", marginBottom: "0.5rem" }}>
				{title}
			</h3>
			<div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>{children}</div>
		</div>
	);
}

function ShopButton({
	label,
	sublabel,
	price,
	sold,
	affordable,
	onClick,
}: {
	label: string;
	sublabel: string;
	price: number;
	sold: boolean;
	affordable: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			disabled={sold || !affordable}
			onClick={onClick}
			style={{
				padding: "0.75rem 1rem",
				minWidth: 140,
				border: "2px solid var(--border)",
				borderRadius: 8,
				textAlign: "center",
				opacity: sold ? 0.4 : affordable ? 1 : 0.6,
				textDecoration: sold ? "line-through" : "none",
			}}
		>
			<div style={{ fontWeight: "bold", marginBottom: "0.25rem" }}>{label}</div>
			<div style={{ fontSize: "0.7rem", color: "var(--text-dim)", marginBottom: "0.25rem" }}>
				{sublabel}
			</div>
			<div style={{ color: "var(--accent-gold)", fontSize: "0.8rem" }}>
				{sold ? "SOLD" : `${price} gold`}
			</div>
		</button>
	);
}

function PurgeView({
	deck,
	onChoose,
	onCancel,
}: {
	deck: ReadonlyArray<{ id: string; uniqueId: number; upgraded: boolean }>;
	onChoose: (index: number) => void;
	onCancel: () => void;
}) {
	return (
		<div
			style={{
				height: "calc(100vh - 36px)",
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				padding: "2rem 1rem",
				gap: "1rem",
			}}
		>
			<h2>Choose a card to remove</h2>
			<div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", justifyContent: "center" }}>
				{deck.map((card, i) => {
					const def = getCard(card.id);
					return (
						<button
							type="button"
							key={card.uniqueId}
							onClick={() => onChoose(i)}
							style={{
								padding: "0.5rem 1rem",
								border: "2px solid var(--border)",
								borderRadius: 6,
								minWidth: 100,
								textAlign: "center",
							}}
						>
							{def?.name ?? card.id}
							{card.upgraded ? "+" : ""}
						</button>
					);
				})}
			</div>
			<button type="button" onClick={onCancel} style={{ padding: "0.5rem 1.5rem" }}>
				Cancel
			</button>
		</div>
	);
}
