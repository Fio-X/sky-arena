import { motion } from "framer-motion";
import { useState } from "react";
import type { CardDef } from "../../engine/content/loader";
import { getCard, getPotion, getRelic } from "../../engine/content/loader";
import { tCard, tCardText, tPotion, tRelic, tUi, tUiFmt } from "../../i18n";
import { useGameStore } from "../../store/gameStore";
import { cardTypeLabel, rarityLabel } from "../cardTextUtils";

function cardTypeColor(type?: CardDef["type"]): string {
	switch (type) {
		case "attack":
			return "var(--card-attack)";
		case "skill":
			return "var(--card-skill)";
		case "power":
			return "var(--card-power)";
		case "curse":
			return "var(--card-curse)";
		default:
			return "var(--text-dim)";
	}
}

function rarityColor(rarity?: string): string {
	switch (rarity) {
		case "uncommon":
			return "var(--uncommon)";
		case "rare":
			return "var(--rare)";
		default:
			return "var(--common)";
	}
}

const pageStyle: React.CSSProperties = {
	height: "calc(100vh - 36px)",
	display: "flex",
	flexDirection: "column",
	alignItems: "center",
	padding: "1.5rem 1rem 2rem",
	gap: "1.25rem",
	overflowY: "auto",
};

const headerStyle = {
	display: "flex" as const,
	flexDirection: "column" as const,
	alignItems: "center" as const,
	gap: "0.4rem",
};

const sectionPanelStyle = {
	background: "var(--bg-glass)",
	backdropFilter: "blur(12px)",
	WebkitBackdropFilter: "blur(12px)",
	border: "1px solid var(--border)",
	borderRadius: 14,
	padding: "1.25rem 1.5rem",
	width: "100%",
	maxWidth: 720,
};

const sectionTitleStyle: React.CSSProperties = {
	fontSize: "0.8rem",
	color: "var(--text-dim)",
	fontWeight: 600,
	textTransform: "uppercase",
	letterSpacing: "0.08em",
	marginBottom: "0.75rem",
};

const gridStyle: React.CSSProperties = {
	display: "flex",
	gap: "0.6rem",
	flexWrap: "wrap",
};

const goldBadgeStyle: React.CSSProperties = {
	display: "inline-flex",
	alignItems: "center",
	gap: "0.3rem",
	fontSize: "0.75rem",
	fontWeight: 600,
};

function GoldBadge({ amount, sold }: { amount: number; sold: boolean }) {
	if (sold) {
		return <span style={{ ...goldBadgeStyle, color: "var(--text-dim)" }}>{tUi("sold")}</span>;
	}
	return <span style={{ ...goldBadgeStyle, color: "var(--accent-gold)" }}>💰 {amount}</span>;
}

/* ── Card item ── */

function ShopCardItem({
	cardId,
	price,
	sold,
	affordable,
	index,
	onClick,
}: {
	cardId: string;
	price: number;
	sold: boolean;
	affordable: boolean;
	index: number;
	onClick: () => void;
}) {
	const def = getCard(cardId);
	const typeColor = cardTypeColor(def?.type);
	const rarColor = rarityColor(def?.rarity);
	const disabled = sold || !affordable;

	return (
		<motion.button
			type="button"
			disabled={disabled}
			onClick={onClick}
			initial={{ opacity: 0, y: 16 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ delay: index * 0.04, duration: 0.3 }}
			whileHover={
				disabled
					? {}
					: { scale: 1.05, borderColor: typeColor, boxShadow: `0 0 18px ${typeColor}33` }
			}
			whileTap={disabled ? {} : { scale: 0.96 }}
			title={tCardText(cardId, def?.text ?? "")}
			style={{
				padding: "0.7rem 0.9rem",
				minWidth: 120,
				maxWidth: 150,
				textAlign: "center",
				background: sold ? "var(--bg-panel)" : "var(--bg-card)",
				border: `1px solid ${sold ? "var(--border)" : `${typeColor}44`}`,
				borderRadius: 10,
				opacity: sold ? 0.35 : affordable ? 1 : 0.5,
				cursor: disabled ? "default" : "pointer",
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				gap: "0.2rem",
			}}
		>
			<div style={{ fontSize: "0.65rem", color: "var(--energy)", fontWeight: 700 }}>
				{def?.cost ?? "?"}
			</div>
			<div
				style={{
					fontWeight: 600,
					fontSize: "0.85rem",
					textDecoration: sold ? "line-through" : "none",
				}}
			>
				{tCard(cardId, def?.name ?? cardId)}
			</div>
			<div style={{ display: "flex", gap: "0.4rem", fontSize: "0.6rem", alignItems: "center" }}>
				<span style={{ color: typeColor, fontWeight: 500 }}>{cardTypeLabel(def?.type)}</span>
				<span style={{ color: rarColor }}>·</span>
				<span style={{ color: rarColor }}>{rarityLabel(def?.rarity)}</span>
			</div>
			<GoldBadge amount={price} sold={sold} />
		</motion.button>
	);
}

/* ── Generic shop item (relics / potions) ── */

function ShopGenericItem({
	label,
	sublabel,
	price,
	sold,
	affordable,
	index,
	accentColor,
	onClick,
}: {
	label: string;
	sublabel: string;
	price: number;
	sold: boolean;
	affordable: boolean;
	index: number;
	accentColor: string;
	onClick: () => void;
}) {
	const disabled = sold || !affordable;

	return (
		<motion.button
			type="button"
			disabled={disabled}
			onClick={onClick}
			initial={{ opacity: 0, y: 16 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ delay: index * 0.04, duration: 0.3 }}
			whileHover={
				disabled
					? {}
					: {
							scale: 1.05,
							borderColor: `${accentColor}88`,
							boxShadow: `0 0 16px ${accentColor}33`,
						}
			}
			whileTap={disabled ? {} : { scale: 0.96 }}
			style={{
				padding: "0.75rem 1rem",
				minWidth: 140,
				maxWidth: 180,
				border: `1px solid ${sold ? "var(--border)" : `${accentColor}44`}`,
				borderRadius: 10,
				textAlign: "center",
				background: sold ? "var(--bg-panel)" : "var(--bg-card)",
				opacity: sold ? 0.35 : affordable ? 1 : 0.5,
				cursor: disabled ? "default" : "pointer",
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				gap: "0.25rem",
			}}
		>
			<div
				style={{
					fontWeight: 600,
					fontSize: "0.85rem",
					textDecoration: sold ? "line-through" : "none",
				}}
			>
				{label}
			</div>
			<div
				style={{
					fontSize: "0.7rem",
					color: "var(--text-dim)",
					lineHeight: 1.3,
					maxWidth: 140,
					overflow: "hidden",
					textOverflow: "ellipsis",
					display: "-webkit-box",
					WebkitLineClamp: 2,
					WebkitBoxOrient: "vertical",
				}}
			>
				{sublabel}
			</div>
			<GoldBadge amount={price} sold={sold} />
		</motion.button>
	);
}

/* ── Section wrapper ── */

function Section({
	title,
	delay,
	children,
}: {
	title: string;
	delay: number;
	children: React.ReactNode;
}) {
	return (
		<motion.div
			initial={{ opacity: 0, y: 20 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ delay, duration: 0.4 }}
			style={sectionPanelStyle}
		>
			<div style={sectionTitleStyle}>{title}</div>
			<div style={gridStyle}>{children}</div>
		</motion.div>
	);
}

/* ── Purge view ── */

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
				gap: "1.25rem",
			}}
		>
			<motion.div
				initial={{ opacity: 0, y: -10 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.3 }}
				style={{
					...sectionPanelStyle,
					maxWidth: 640,
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
					gap: "1rem",
				}}
			>
				<h2
					style={{
						fontSize: "1.2rem",
						fontWeight: 700,
						color: "var(--accent)",
						letterSpacing: "0.02em",
					}}
				>
					{tUi("chooseCardToRemove")}
				</h2>
				<div
					style={{
						display: "flex",
						gap: "0.5rem",
						flexWrap: "wrap",
						justifyContent: "center",
					}}
				>
					{deck.map((card, i) => {
						const def = getCard(card.id);
						const typeColor = cardTypeColor(def?.type);
						return (
							<motion.button
								type="button"
								key={card.uniqueId}
								onClick={() => onChoose(i)}
								initial={{ opacity: 0, scale: 0.9 }}
								animate={{ opacity: 1, scale: 1 }}
								transition={{ delay: i * 0.02, duration: 0.25 }}
								whileHover={{
									scale: 1.08,
									borderColor: "var(--accent)",
									boxShadow: "0 0 14px rgba(255,60,111,0.25)",
								}}
								whileTap={{ scale: 0.95 }}
								style={{
									padding: "0.5rem 0.85rem",
									border: `1px solid ${typeColor}44`,
									borderRadius: 8,
									minWidth: 90,
									textAlign: "center",
									background: "var(--bg-card)",
									cursor: "pointer",
								}}
							>
								<div style={{ fontWeight: 600, fontSize: "0.8rem" }}>
									{tCard(card.id, def?.name ?? card.id)}
									{card.upgraded ? "+" : ""}
								</div>
								<div
									style={{
										fontSize: "0.6rem",
										color: typeColor,
									}}
								>
									{cardTypeLabel(def?.type)}
								</div>
							</motion.button>
						);
					})}
				</div>
				<motion.button
					type="button"
					onClick={onCancel}
					whileHover={{ scale: 1.03 }}
					whileTap={{ scale: 0.97 }}
					style={{
						padding: "0.5rem 1.5rem",
						borderRadius: 10,
						background: "var(--bg-panel)",
						border: "1px solid var(--border)",
						color: "var(--text-dim)",
						cursor: "pointer",
					}}
				>
					{tUi("cancel")}
				</motion.button>
			</motion.div>
		</div>
	);
}

/* ── Main shop ── */

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
		<div style={pageStyle}>
			{/* Header */}
			<motion.div
				initial={{ opacity: 0, y: -12 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.4 }}
				style={headerStyle}
			>
				<h2
					style={{
						fontSize: "1.5rem",
						fontWeight: 700,
						color: "var(--text-bright)",
						letterSpacing: "0.02em",
					}}
				>
					🏪 {tUi("shop")}
				</h2>
				<div
					style={{
						display: "inline-flex",
						alignItems: "center",
						gap: "0.4rem",
						background: "var(--bg-glass)",
						backdropFilter: "blur(8px)",
						WebkitBackdropFilter: "blur(8px)",
						border: "1px solid rgba(255,200,48,0.25)",
						borderRadius: 20,
						padding: "0.35rem 1rem",
						fontSize: "1rem",
						fontWeight: 700,
						color: "var(--accent-gold)",
					}}
				>
					💰 {gold} {tUi("goldUnit")}
				</div>
			</motion.div>

			{/* Cards */}
			<Section title={tUi("cards")} delay={0.1}>
				{shop.cards.map((item, i) => (
					<ShopCardItem
						key={item.cardId as string}
						cardId={item.cardId as string}
						price={item.price}
						sold={item.sold}
						affordable={gold >= item.price}
						index={i}
						onClick={() => dispatch({ type: "chooseShopItem", index: cardOffset + i })}
					/>
				))}
			</Section>

			{/* Relics */}
			<Section title={tUi("relics")} delay={0.2}>
				{shop.relics.map((item, i) => {
					const def = getRelic(item.relicId as string);
					return (
						<ShopGenericItem
							key={item.relicId as string}
							label={tRelic(item.relicId as string, def?.name ?? (item.relicId as string))}
							sublabel={def?.text ?? ""}
							price={item.price}
							sold={item.sold}
							affordable={gold >= item.price}
							index={i}
							accentColor="#6c5ce7"
							onClick={() => dispatch({ type: "chooseShopItem", index: relicOffset + i })}
						/>
					);
				})}
			</Section>

			{/* Potions */}
			<Section title={tUi("potions")} delay={0.3}>
				{shop.potions.map((item, i) => {
					const def = getPotion(item.potionId as string);
					return (
						<ShopGenericItem
							key={item.potionId as string}
							label={tPotion(item.potionId as string, def?.name ?? (item.potionId as string))}
							sublabel={def?.text ?? ""}
							price={item.price}
							sold={item.sold}
							affordable={gold >= item.price && state.potions.includes(null)}
							index={i}
							accentColor="#00e88f"
							onClick={() => dispatch({ type: "chooseShopItem", index: potionOffset + i })}
						/>
					);
				})}
			</Section>

			{/* Purge & Leave */}
			<motion.div
				initial={{ opacity: 0, y: 12 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ delay: 0.4, duration: 0.3 }}
				style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", justifyContent: "center" }}
			>
				{!shop.purgeUsed && (
					<motion.button
						type="button"
						disabled={gold < shop.purgePrice}
						onClick={() => setPurgeMode(true)}
						whileHover={
							gold < shop.purgePrice
								? {}
								: { scale: 1.04, boxShadow: "0 0 16px rgba(255,60,111,0.25)" }
						}
						whileTap={gold < shop.purgePrice ? {} : { scale: 0.97 }}
						style={{
							padding: "0.75rem 1.5rem",
							borderRadius: 10,
							border: "1px solid rgba(255,60,111,0.4)",
							background: "linear-gradient(135deg, rgba(255,60,111,0.12), rgba(255,60,111,0.04))",
							color: "var(--text)",
							fontWeight: 600,
							cursor: gold < shop.purgePrice ? "default" : "pointer",
						}}
					>
						{tUiFmt("removeCard", String(shop.purgePrice))}
					</motion.button>
				)}

				<motion.button
					type="button"
					onClick={() => dispatch({ type: "leaveShop" })}
					whileHover={{ scale: 1.04 }}
					whileTap={{ scale: 0.97 }}
					style={{
						padding: "0.75rem 2rem",
						borderRadius: 10,
						background: "var(--bg-panel)",
						border: "1px solid var(--border)",
						color: "var(--text-dim)",
						fontWeight: 600,
						cursor: "pointer",
					}}
				>
					{tUi("leaveShop")}
				</motion.button>
			</motion.div>
		</div>
	);
}
