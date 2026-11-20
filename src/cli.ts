/**
 * CLI entry point for headless game execution.
 *
 * Usage:
 *   npx vite-node src/cli.ts -- --seed 42 --commands commands.json
 *   npx vite-node src/cli.ts -- --seed 42 --commands commands.json --snapshot-dir ./snapshots
 *
 * Input: commands.json is an array of Command objects.
 * Output: one JSON state snapshot per step to stdout (or snapshot-dir).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import cardsJson from "../data-reference/cards.json";
import eventsJson from "../data-reference/events.json";
import monstersAct1Json from "../data-reference/monsters-act1.json";
import monstersAct2Json from "../data-reference/monsters-act2.json";
import monstersAct34Json from "../data-reference/monsters-act34.json";
import potionsJson from "../data-reference/potions.json";
import powersJson from "../data-reference/powers.json";
import relicsJson from "../data-reference/relics.json";

import "./engine/content";
import {
	loadCards,
	loadMonsters,
	loadPotions,
	loadPowers,
	loadRelics,
} from "./engine/content/loader";
import { loadEvents } from "./engine/core/event";
import { createRun } from "./engine/core/newRun";
import { initPotionPool } from "./engine/core/potion";
import { step } from "./engine/core/step";
import type { Command, GameState } from "./engine/core/types";

function loadContent() {
	loadCards(cardsJson as never);
	loadMonsters(monstersAct1Json as never);
	loadMonsters(monstersAct2Json as never);
	loadMonsters(monstersAct34Json.monsters as never);
	loadPowers(powersJson as never);
	loadRelics(relicsJson as never);
	loadPotions(potionsJson as never);
	initPotionPool(potionsJson as never);
	loadEvents(eventsJson as never);
}

function createInitialState(seed: bigint): GameState {
	return createRun(seed, "IRONCLAD");
}

function parseArgs(argv: string[]) {
	let seed = 42n;
	let commandsFile = "";
	let snapshotDir = "";

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		const next = argv[i + 1];
		if (arg === "--seed" && next) {
			seed = BigInt(next);
			i++;
		} else if (arg === "--commands" && next) {
			commandsFile = next;
			i++;
		} else if (arg === "--snapshot-dir" && next) {
			snapshotDir = next;
			i++;
		}
	}
	return { seed, commandsFile, snapshotDir };
}

function main() {
	const args = parseArgs(process.argv.slice(2));

	if (!args.commandsFile) {
		console.error("Usage: npx vite-node src/cli.ts -- --seed <N> --commands <file.json>");
		process.exit(1);
	}

	loadContent();

	const raw = readFileSync(resolve(args.commandsFile), "utf-8");
	const commands: Command[] = JSON.parse(raw);
	let state = createInitialState(args.seed);

	if (args.snapshotDir) {
		mkdirSync(args.snapshotDir, { recursive: true });
	}

	const write = (i: number, s: GameState) => {
		const json = JSON.stringify(s, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
		if (args.snapshotDir) {
			writeFileSync(resolve(args.snapshotDir, `step-${String(i).padStart(4, "0")}.json`), json);
		} else {
			console.log(json);
		}
	};

	write(0, state);

	for (let i = 0; i < commands.length; i++) {
		const cmd = commands[i];
		if (!cmd) continue;
		const result = step(state, cmd);
		state = result.state;
		write(i + 1, state);
	}

	console.error(`Executed ${commands.length} commands. Final phase: ${state.phase.type}`);
}

main();
