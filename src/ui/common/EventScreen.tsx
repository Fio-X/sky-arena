import { getEvent } from "../../engine/core/event";
import { useGameStore } from "../../store/gameStore";

export function EventScreen() {
	const state = useGameStore((s) => s.state);
	const dispatch = useGameStore((s) => s.dispatch);

	if (state?.phase.type !== "event") return null;
	const def = getEvent(state.phase.eventId);

	if (!def) {
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
				<h2>Unknown Event</h2>
				<button type="button" onClick={() => dispatch({ type: "proceed" })}>
					Continue
				</button>
			</div>
		);
	}

	return (
		<div
			style={{
				height: "calc(100vh - 36px)",
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				justifyContent: "center",
				gap: "1.5rem",
				padding: "2rem 1rem",
			}}
		>
			<h2>{def.name}</h2>
			<p style={{ color: "var(--text-dim)", maxWidth: 500, textAlign: "center" }}>{def.summary}</p>

			<div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", minWidth: 300 }}>
				{def.options.map((option, i) => (
					<button
						type="button"
						key={option.label}
						onClick={() => dispatch({ type: "chooseEventOption", index: i })}
						style={{
							padding: "0.75rem 1.5rem",
							border: "2px solid var(--border)",
							borderRadius: 8,
							textAlign: "left",
						}}
					>
						{option.label}
					</button>
				))}
			</div>

			<button
				type="button"
				onClick={() => dispatch({ type: "proceed" })}
				style={{ padding: "0.5rem 1.5rem", color: "var(--text-dim)" }}
			>
				Leave
			</button>
		</div>
	);
}
