// ── 顶层游戏状态 ──────────────────────────────────────────

export interface GameState {
	readonly seed: bigint;
	readonly character: CharacterId;
	readonly ascension: number; // 0-20

	// run-level
	readonly act: number; // 1-4
	readonly floor: number;
	readonly gold: number;
	readonly maxHp: number;
	readonly currentHp: number;
	readonly potionSlots: number;
	readonly potions: (PotionId | null)[];
	readonly deck: CardInstance[];
	readonly relics: RelicInstance[];
	readonly map: MapState;

	// combat (null when not in combat)
	readonly combat: CombatState | null;

	// encounter tracking
	readonly encounterIndex: { weak: number; strong: number; elite: number };
	readonly encounterLists: {
		weak: string[];
		strong: string[];
		elites: string[];
		boss: string;
	};

	// rng streams
	readonly rng: RngStreams;

	// phase
	readonly phase: GamePhase;
}

export type GamePhase =
	| { type: "neow" }
	| { type: "map" }
	| { type: "combat"; turn: number }
	| { type: "event"; eventId: string }
	| { type: "shop"; shop: ShopData }
	| { type: "rest" }
	| { type: "reward"; cardRewards: CardId[]; potionReward: PotionId | null; gold: number }
	| { type: "bossReward"; relics: RelicId[] }
	| { type: "cardSelect"; task: CardSelectTask; drawAfter?: number; options?: CardInstance[] }
	| { type: "gameOver"; victory: boolean };

export interface ShopData {
	readonly cards: ReadonlyArray<{ kind: "card"; cardId: CardId; price: number; sold: boolean }>;
	readonly relics: ReadonlyArray<{ kind: "relic"; relicId: RelicId; price: number; sold: boolean }>;
	readonly potions: ReadonlyArray<{
		kind: "potion";
		potionId: PotionId;
		price: number;
		sold: boolean;
	}>;
	readonly purgePrice: number;
	readonly purgeUsed: boolean;
}

export type CardSelectTask =
	| "armaments"
	| "codex"
	| "discovery"
	| "dualWield"
	| "exhaust"
	| "exhume"
	| "forethought"
	| "gamble"
	| "headbutt"
	| "recycle"
	| "acrobatics"
	| "concentrate"
	| "daggerThrow"
	| "nightmare"
	| "prepared"
	| "setup"
	| "survivor"
	| "toolsOfTheTrade"
	| "warcry"
	| "seek"
	| "wellLaidPlans"
	| "hologram";

// ── 战斗状态 ──────────────────────────────────────────────

export interface CombatState {
	readonly turn: number;
	readonly player: PlayerCombatState;
	readonly monsters: MonsterState[];
	readonly drawPile: CardInstance[];
	readonly hand: CardInstance[];
	readonly discardPile: CardInstance[];
	readonly exhaustPile: CardInstance[];
	readonly energy: number;
	readonly maxEnergy: number;
	readonly actionQueue: Action[];
	readonly cardQueue: CardQueueItem[];
	readonly cardsPlayedThisTurn: number;
	readonly cardsDiscardedThisTurn: number;
	readonly lightningChanneled: number;
	readonly frostChanneled: number;
	/** Set by a hook to end the player's turn once the current card finishes (Time Warp). */
	readonly endTurnRequested?: boolean;
}

export interface PlayerCombatState {
	readonly block: number;
	readonly powers: PowerInstance[];
	readonly stance: StanceId;
	readonly orbs: OrbInstance[];
	readonly orbSlots: number;
}

export interface MonsterState {
	readonly id: MonsterId;
	readonly index: number;
	readonly maxHp: number;
	readonly currentHp: number;
	readonly block: number;
	readonly powers: PowerInstance[];
	readonly intent: MonsterIntent;
	readonly moveHistory: MonsterMoveId[];
	readonly alive: boolean;
	/**
	 * Original AbstractMonster.halfDead: at 0 HP, alive = false (untargetable),
	 * but still takes turns and blocks victory (Darkling Regrow, Awakened One
	 * rebirth). See combat/death.ts.
	 */
	readonly halfDead: boolean;
	/** Slime split trigger: HP fell to half or below, next move is SPLIT. */
	readonly splitPending?: boolean;
	readonly miscInfo: number;
	/** Card taken by Bronze Orb STASIS; returned to hand when this monster dies. */
	readonly heldCard?: CardInstance;
}

export interface MonsterIntent {
	readonly moveId: MonsterMoveId;
	readonly baseDamage: number | null;
	readonly hits: number;
	readonly isAttack: boolean;
	readonly isDebuff: boolean;
	readonly isBuff: boolean;
}

// ── 卡牌实例 ──────────────────────────────────────────────

export interface CardInstance {
	readonly id: CardId;
	readonly uniqueId: number;
	readonly upgraded: boolean;
	readonly costOverride: number | null; // null = use base cost
	readonly costForTurn: number;
	readonly freeToPlay: boolean;
	readonly misc: number;
}

export interface CardQueueItem {
	readonly card: CardInstance;
	readonly targetIndex: number;
	readonly purgeOnUse: boolean;
	readonly autoplay: boolean;
	readonly randomTarget: boolean;
}

// ── 遗物与药水实例 ────────────────────────────────────────

export interface RelicInstance {
	readonly id: RelicId;
	readonly counter: number;
}

// ── Orb ───────────────────────────────────────────────────

export interface OrbInstance {
	readonly type: OrbType;
	readonly passive: number;
	readonly evoke: number;
}

export type OrbType = "empty" | "lightning" | "frost" | "dark" | "plasma";

// ── Power 实例 ────────────────────────────────────────────

export interface PowerInstance {
	readonly id: PowerId;
	readonly amount: number;
	readonly justApplied: boolean;
}

// ── 姿态 ─────────────────────────────────────────────────

export type StanceId = "neutral" | "wrath" | "calm" | "divinity";

// ── 地图 ──────────────────────────────────────────────────

export interface MapState {
	readonly nodes: MapNode[][];
	readonly currentNode: { x: number; y: number } | null;
	readonly visitedNodes: Array<{ x: number; y: number }>;
}

export interface MapNode {
	readonly x: number;
	readonly y: number;
	readonly type: RoomType;
	readonly edges: Array<{ x: number; y: number }>;
}

export type RoomType = "monster" | "elite" | "rest" | "shop" | "treasure" | "event" | "boss";

// ── 命令（玩家输入）──────────────────────────────────────

export type Command =
	| { type: "playCard"; handIndex: number; targetIndex: number }
	| { type: "endTurn" }
	| { type: "chooseMapNode"; x: number; y: number }
	| { type: "chooseNeowBlessing"; index: number }
	| { type: "chooseEventOption"; index: number }
	| { type: "chooseCardReward"; index: number }
	| { type: "skipCardReward" }
	| { type: "chooseShopItem"; index: number }
	| { type: "shopPurge"; cardIndex: number }
	| { type: "leaveShop" }
	| { type: "chooseBossRelic"; index: number }
	| { type: "rest" }
	| { type: "smith"; cardIndex: number }
	| { type: "usePotion"; index: number; targetIndex: number }
	| { type: "discardPotion"; index: number }
	| { type: "chooseCard"; indices: number[] }
	| { type: "obtainPotionReward" }
	| { type: "proceed" };

// ── 动作（内部效果队列）──────────────────────────────────

export type Action =
	/**
	 * nonAttack: DamageType.THORNS in the original (Exploder's explosion) — no
	 * Strength/Weak/Vulnerable/stance modifiers and no onAttack/onAttacked hooks;
	 * block and Intangible still apply.
	 */
	| {
			type: "damage";
			source: ActorRef;
			target: ActorRef;
			baseDamage: number;
			hits: number;
			nonAttack?: boolean;
	  }
	| { type: "block"; source: ActorRef; amount: number }
	| { type: "heal"; target: ActorRef; amount: number }
	| { type: "loseHp"; target: ActorRef; amount: number }
	| { type: "applyPower"; source: ActorRef; target: ActorRef; powerId: PowerId; amount: number }
	| { type: "drawCards"; count: number }
	| { type: "discardCard"; handIndex: number }
	| { type: "exhaustCard"; handIndex: number }
	| { type: "addCardToHand"; cardId: CardId; upgraded: boolean }
	/** randomSpot: CardGroup.addToRandomSpot — index cardRandomRng.random(size - 1), never the top. */
	| {
			type: "addCardToDrawPile";
			cardId: CardId;
			upgraded: boolean;
			toTop: boolean;
			randomSpot?: boolean;
	  }
	/** Permanent: into the master deck (Writhing Mass IMPLANT → Parasite). */
	| { type: "addCardToMasterDeck"; cardId: CardId }
	| { type: "addCardToDiscardPile"; cardId: CardId; upgraded: boolean }
	| { type: "gainEnergy"; amount: number }
	| { type: "loseEnergy"; amount: number }
	| { type: "gainGold"; amount: number }
	| { type: "loseGold"; amount: number }
	| { type: "gainMaxHp"; amount: number }
	| { type: "loseMaxHp"; amount: number }
	| { type: "channelOrb"; orbType: OrbType }
	| { type: "evokeOrb"; times: number }
	| { type: "changeStance"; stance: StanceId }
	| { type: "monsterMove"; monsterIndex: number }
	| { type: "rollMove"; monsterIndex: number }
	| { type: "shuffle" }
	| { type: "scry"; count: number }
	| {
			type: "split";
			sourceIndex: number;
			spawnId: MonsterId;
			count: number;
	  }
	| { type: "escape"; monsterIndex: number }
	/** SuicideAction: HP → 0 and die() without the damage path (no Regrow/rebirth). */
	| { type: "monsterDie"; monsterIndex: number }
	/** Summon into a slot (replacing a dead/empty one). RANDOM_GREMLIN picks with aiRng. */
	| {
			type: "spawnMonster";
			monsterId: MonsterId | "RANDOM_GREMLIN";
			slot: number;
			minion: boolean;
			/** Burn one aiRng.random(99) after spawning (Torch Head parity). */
			burnAiRoll?: boolean;
	  }
	| { type: "removeDebuffs"; target: ActorRef }
	/** Single hit; the source heals by the HP the target actually lost (Shelled Parasite SUCK). */
	| { type: "vampireDamage"; source: ActorRef; target: ActorRef; baseDamage: number }
	/** Bronze Orb STASIS: take a card from the draw (else discard) pile and hold it. */
	| { type: "stealCard"; monsterIndex: number }
	| { type: "custom"; execute: (state: GameState) => GameState };

export type ActorRef = { type: "player" } | { type: "monster"; index: number };

// ── 事件（UI 通知）───────────────────────────────────────

export type GameEvent =
	| { type: "cardPlayed"; card: CardInstance; target: ActorRef }
	| { type: "damageDealt"; source: ActorRef; target: ActorRef; amount: number; blocked: number }
	| { type: "healed"; target: ActorRef; amount: number }
	| { type: "hpLost"; target: ActorRef; amount: number }
	| { type: "blockGained"; target: ActorRef; amount: number }
	| { type: "powerApplied"; target: ActorRef; powerId: PowerId; amount: number }
	| { type: "cardDrawn"; card: CardInstance }
	| { type: "cardExhausted"; card: CardInstance }
	| { type: "cardDiscarded"; card: CardInstance }
	| { type: "monsterDied"; index: number }
	| { type: "turnStarted"; turn: number }
	| { type: "turnEnded"; turn: number }
	| { type: "combatStarted" }
	| { type: "combatEnded"; victory: boolean }
	| { type: "orbChanneled"; orbType: OrbType }
	| { type: "orbEvoked"; orbType: OrbType; damage: number }
	| { type: "stanceChanged"; from: StanceId; to: StanceId }
	| { type: "goldChanged"; delta: number }
	| { type: "shuffled" }
	| { type: "monsterSplit"; sourceIndex: number; newIndices: number[] }
	| { type: "monsterEscaped"; index: number }
	| { type: "cardRewardOffered"; cards: CardId[] }
	| { type: "cardRewardChosen"; card: CardId }
	| { type: "neowBlessingChosen"; blessing: string }
	| { type: "potionUsed"; potionId: PotionId; slot: number }
	| { type: "potionDiscarded"; potionId: PotionId; slot: number }
	| { type: "potionObtained"; potionId: PotionId; slot: number };

// ── step 函数签名 ─────────────────────────────────────────

export interface StepResult {
	readonly state: GameState;
	readonly events: GameEvent[];
}

// ── RNG streams ───────────────────────────────────────────

export interface RngStreams {
	readonly cardRng: RngState;
	readonly relicRng: RngState;
	readonly potionRng: RngState;
	readonly monsterRng: RngState;
	readonly eventRng: RngState;
	readonly merchantRng: RngState;
	readonly treasureRng: RngState;
	readonly mapRng: RngState;
	readonly neowRng: RngState;
	readonly miscRng: RngState;
	readonly shuffleRng: RngState;
	readonly cardRandomRng: RngState;
	readonly aiRng: RngState;
	readonly monsterHpRng: RngState;
}

export interface RngState {
	readonly seed0: bigint;
	readonly seed1: bigint;
	readonly counter: number;
}

// ── Nominal ID types ──────────────────────────────────────

export type CardId = string & { readonly __brand: "CardId" };
export type RelicId = string & { readonly __brand: "RelicId" };
export type PotionId = string & { readonly __brand: "PotionId" };
export type PowerId = string & { readonly __brand: "PowerId" };
export type MonsterId = string & { readonly __brand: "MonsterId" };
export type MonsterMoveId = string & { readonly __brand: "MonsterMoveId" };
export type CharacterId = "IRONCLAD" | "SILENT" | "DEFECT" | "WATCHER";
