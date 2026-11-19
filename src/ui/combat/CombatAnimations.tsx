import { useEffect, useRef, useState } from "react";
import { getPower } from "../../engine/content/loader";
import type { GameEvent } from "../../engine/core/types";
import { useGameStore } from "../../store/gameStore";

export interface FloatingText {
	id: number;
	text: string;
	color: string;
	targetType: "player" | "monster";
	targetIndex: number;
}

let nextId = 0;

function makeFloat(
	text: string,
	color: string,
	target: { type: "player" } | { type: "monster"; index: number },
): FloatingText {
	return {
		id: nextId++,
		text,
		color,
		targetType: target.type,
		targetIndex: target.type === "monster" ? target.index : 0,
	};
}

function eventToFloat(e: GameEvent): FloatingText | null {
	switch (e.type) {
		case "damageDealt":
			return e.amount > 0 ? makeFloat(`-${e.amount}`, "var(--accent)", e.target) : null;
		case "blockGained":
			return e.amount > 0 ? makeFloat(`+${e.amount} 🛡`, "var(--accent-blue)", e.target) : null;
		case "healed":
			return e.amount > 0 ? makeFloat(`+${e.amount}`, "#4caf50", e.target) : null;
		case "powerApplied": {
			if (e.amount === 0) return null;
			const name = getPower(e.powerId)?.name ?? e.powerId;
			const sign = e.amount > 0 ? "+" : "";
			const color = e.amount > 0 ? "var(--accent-gold)" : "var(--accent-blue)";
			return makeFloat(`${sign}${e.amount} ${name}`, color, e.target);
		}
		default:
			return null;
	}
}

function eventsToFloats(events: GameEvent[]): FloatingText[] {
	const floats: FloatingText[] = [];
	for (const e of events) {
		const f = eventToFloat(e);
		if (f) floats.push(f);
	}
	return floats;
}

export function useFloatingTexts(): {
	playerFloats: FloatingText[];
	monsterFloats: (index: number) => FloatingText[];
} {
	const events = useGameStore((s) => s.events);
	const [floats, setFloats] = useState<FloatingText[]>([]);
	const prevRef = useRef(events);

	useEffect(() => {
		if (events === prevRef.current || events.length === 0) return;
		prevRef.current = events;

		const newFloats = eventsToFloats(events);
		if (newFloats.length === 0) return;

		setFloats((prev) => [...prev, ...newFloats]);

		const ids = newFloats.map((f) => f.id);
		const timer = setTimeout(() => {
			setFloats((prev) => prev.filter((f) => !ids.includes(f.id)));
		}, 900);
		return () => clearTimeout(timer);
	}, [events]);

	return {
		playerFloats: floats.filter((f) => f.targetType === "player"),
		monsterFloats: (index: number) =>
			floats.filter((f) => f.targetType === "monster" && f.targetIndex === index),
	};
}

const FLOAT_STYLE = `@keyframes combatFloatUp {
	0% { opacity: 1; transform: translateY(0) scale(1); }
	20% { opacity: 1; transform: translateY(-8px) scale(1.1); }
	100% { opacity: 0; transform: translateY(-36px) scale(0.9); }
}`;

export function FloatLayer({ items }: { items: FloatingText[] }) {
	if (items.length === 0) return null;
	return (
		<div
			style={{
				position: "absolute",
				top: -8,
				left: "50%",
				transform: "translateX(-50%)",
				pointerEvents: "none",
				zIndex: 10,
			}}
		>
			<style>{FLOAT_STYLE}</style>
			{items.map((f, i) => (
				<div
					key={f.id}
					style={{
						animation: "combatFloatUp 0.8s ease-out forwards",
						color: f.color,
						fontWeight: "bold",
						fontSize: "1rem",
						textShadow: "0 1px 3px rgba(0,0,0,0.6)",
						whiteSpace: "nowrap",
						textAlign: "center",
						marginTop: i > 0 ? -2 : 0,
					}}
				>
					{f.text}
				</div>
			))}
		</div>
	);
}
