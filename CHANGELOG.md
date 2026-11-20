# Changelog

## v1.0.0 — 复刻阶段完成（2026-11-20）

Slay the Spire V2.3.4 功能复刻全部完成。接下来项目转向原创牌组构筑游戏。

### 最终数字

| 指标 | 数量 |
|---|---|
| 可玩 Act | 4（含三钥匙 → Act 4） |
| 卡牌效果 | 335 |
| 怪物 AI | 65 / 65 |
| Power hooks | 119 ID |
| 遗物效果 | 181 / 181 |
| 药水效果 | 42 / 42 |
| 事件 | 51 / 51 |
| 升阶 | 1–20 |
| 四角色 | Ironclad / Silent / Defect / Watcher |
| 测试 | 1078 个，50 文件，全过 |

### 本版本最后一批改动（未提交）

**补全遗物 171 → 181（10 个）：**
- Boss 遗物 +1 能量：Velvet Choker、Ectoplasm、Philosopher's Stone、Mark of Pain
- Bottled Flame / Lightning / Tornado：onEquip 选牌（DeckSelectTask）+ atBattleStart 移到手牌
- Nilry's Codex：回合末 3 选 1 洗入抽牌堆（拆分 stepEndTurnContinue → stepEndTurnPostCodex）
- Frozen Eye：已有 UI 实现（CardPileViewer 排序）
- Discerning Monocle：商店 8 折
- 空遗物池回退：CIRCLET（event.ts + relicsRun2.ts）

**涉及文件：**
- `src/engine/content/relicHooksAdvanced.ts` — plusMaxEnergy + 4 个 boss 遗物 atBattleStart
- `src/engine/content/relicsRun.ts` — Bottled 三遗物注册（onEquip + atBattleStart）
- `src/engine/content/relicsRun2.ts` — Bottled 选牌过滤、applyDeckSelection 存 counter、空池回退
- `src/engine/core/turn.ts` — codexDiscover() + stepEndTurnPostCodex 导出
- `src/engine/core/cardSelect.ts` — codex case 走 stepEndTurnPostCodex
- `src/engine/core/shop.ts` — Discerning Monocle 折扣
- `src/engine/core/event.ts` — 空遗物池回退 CIRCLET
- `src/engine/core/types.ts` — DeckSelectTask 新增 bottledFlame/Lightning/Tornado
- `src/ui/common/DeckSelectScreen.tsx` — Bottled 遗物选牌标题

### 此前的提交历史

从基础引擎到 v1.0.0 的关键里程碑（按时间倒序）：

- 项目改名 Sky Arena / 天空竞技场
- 药水奖励修正（满栏照掷、稀有度权重、±10 修正）
- 伤害修正批次（The Boot、Wreath of Flame、Wrist Blade、Perfected Strike）
- 战斗外死亡 + 回血检查（瓶中妖精、蜥蜴尾巴、血之印记）
- 怪物进阶核对（Act 1–4，65 个怪物逐级）
- 进阶 1–20 局外规则
- 事件 51 个（框架 + Act 1/2/3 + 神龛 + 一次性）
- Act 4（三钥匙、Shield/Spear、Corrupt Heart）
- 药水 42 个
- 战斗遗物 59 个 + 局外遗物 59 个
- Act 3 全部接入（普通怪、精英、Boss）
- 核心引擎（纯函数 step、钩子系统、伤害管线、地图、充能球）
