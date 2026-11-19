import { useState } from "react";
import { getLocale, type Locale, setLocale } from "../../i18n";

/** Small language toggle button for the HUD bar. */
export function LanguageToggle() {
	const [locale, setLoc] = useState<Locale>(getLocale());

	function toggle() {
		const next: Locale = locale === "zh" ? "en" : "zh";
		setLocale(next);
		setLoc(next);
		window.dispatchEvent(new Event("locale-changed"));
	}

	return (
		<button
			type="button"
			onClick={toggle}
			style={{
				padding: "0.125rem 0.5rem",
				background: "none",
				border: "1px solid var(--border)",
				borderRadius: 4,
				fontSize: "0.75rem",
				color: "var(--text-dim)",
				cursor: "pointer",
				marginLeft: "auto",
			}}
		>
			{locale === "zh" ? "EN" : "中文"}
		</button>
	);
}
