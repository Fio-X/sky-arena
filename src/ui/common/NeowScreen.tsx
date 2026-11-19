import { NEOW_BLESSINGS } from "../../engine/core/neow";
import { tNeow, tUi } from "../../i18n";
import { useGameStore } from "../../store/gameStore";

export function NeowScreen() {
	const dispatch = useGameStore((s) => s.dispatch);

	return (
		<div
			style={{
				height: "calc(100vh - 36px)",
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				justifyContent: "center",
				gap: "1.5rem",
			}}
		>
			<h2>{tUi("neowLament")}</h2>
			<p style={{ color: "var(--text-dim)", maxWidth: 400, textAlign: "center" }}>
				{tUi("neowChoose")}
			</p>
			<div
				style={{
					display: "flex",
					gap: "1rem",
					flexWrap: "wrap",
					justifyContent: "center",
					maxWidth: 600,
				}}
			>
				{NEOW_BLESSINGS.map((b, i) => (
					<button
						type="button"
						key={b.id}
						onClick={() => dispatch({ type: "chooseNeowBlessing", index: i })}
						style={{
							padding: "1rem",
							minWidth: 130,
							maxWidth: 160,
							display: "flex",
							flexDirection: "column",
							alignItems: "center",
							gap: "0.5rem",
							background: "var(--bg-card)",
							border: "2px solid var(--border)",
							borderRadius: 8,
							cursor: "pointer",
						}}
					>
						<strong>{tNeow(b.id)?.label ?? b.label}</strong>
						<span style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>
							{tNeow(b.id)?.description ?? b.description}
						</span>
					</button>
				))}
			</div>
		</div>
	);
}
