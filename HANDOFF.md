# PJ008 天空竞技场（Sky Arena）— 交接文档

> 给下一个对话窗口用的上下文。**先读「最新状态与方向」**，再按需看后面的历史记录。

## 项目概况

- **名称**：天空竞技场 / Sky Arena（2026-11-20 由「杀戮尖塔网页版」改名）
- **仓库**：https://github.com/Fio-X/sky-arena （公开；用户选择保持公开）
- **部署**：https://fio-x.github.io/sky-arena/ （push main 自动部署；旧地址 /slay-the-spire-web/ 已 404）
- **目录**：`/Users/fio/code/PJ008/`
- **详细计划与架构**：`项目计划.md`（底层架构 / 目录结构 / ADR-1~14 / 进度快照）。注意：计划的「目标」一行仍写着「忠实复刻 Slay the Spire V2.3.4」，方向变了但还没改

## 最新状态与方向（v1.0.0 — 2026-11-20）

### 代码
- **v1.0.0**：复刻阶段全部完成（计划 5-1 ~ 5-10 全 ✅）
- main 最新提交 37bebd2（改名）。工作区有未提交的最后一批遗物补全（10 个）+ 版本记录
- 门禁 `npm run check` 通过；测试 1078 个 / 50 文件全过
- v1.0.0 最后一批：Boss 遗物 +1 能量（Velvet Choker / Ectoplasm / Philosopher's Stone / Mark of Pain）、Bottled Flame/Lightning/Tornado（onEquip 选牌 + atBattleStart 移到手牌）、Nilry's Codex（回合末 3 选 1 洗入抽牌堆）、Frozen Eye（已有 UI）、Discerning Monocle（商店 8 折）、空遗物池回退 Circlet

### 方向（重要）
1. **Claude 不再往复刻杀戮尖塔的内容里加东西**：不新增复刻内容（剩下的遗物、按原版修补还原度、仿原作美术都不做）。理由：这是对一款具体商业游戏的复刻（名字、角色、全部卡牌、怪物、事件、数值），而且公开部署；数据来自 slay-the-cli，计划决策 2 的「发布前评估许可」从未做，仓库无 LICENSE
2. **用户选了「路线 1：转成原创牌组构筑游戏」**：保留通用引擎（约 8 千行：core 循环、钩子、伤害管线、战斗、地图、随机数、UI 框架），换掉复刻内容（content/ 约 1.5 万行、events 约 2.5 千行、data-reference 约 2.5 万行 JSON、i18n 官方译名约 1.8 千行、4 张立绘、Neow/三钥匙/Heart 结构）
3. **但用户还没想通玩法**，曾提出「先按原计划复刻、跑通上线玩一段时间再说」。Claude 没有同意，理由：复刻版好玩只证明杀戮尖塔好玩，验证不了天空竞技场自己的设计；且上线运营正是版权风险最集中处。建议改为在现有引擎上做原创小原型快速试错（1 角色、约 15 张原创卡、2–3 种怪、1 个核心机制；自动对战统计胜率 + 自己试玩）
4. **用户目前的状态**：不理解杀戮尖塔好玩在哪。Claude 讲了四层乐趣（回合内全信息谜题、加牌有代价/卡组稀释、跨战斗的血量资源与路线、随机下的适应 + 永久死亡），并建议：玩原版 3–5 局（铁甲战士、进阶 0），每个决定前问「有没有另一种出法」「这张卡真的需要吗」；或看 Jorbs 这类讲思路的直播。等用户回来说「哪一层觉得有意思、哪一刻觉得无聊」，据此定天空竞技场从哪下手
5. 曾提出的三个原创方向（只是举例，用户未选）：观众热度（连招涨热度、拖延被喝倒彩）、高度与风向（每回合风向改变哪类卡变强）、擂台站位（击退、逼到边缘）

### 下一个对话可以做 / 不做
- **可以**：陪用户想玩法；在现有引擎上实现**原创**原型内容和测试；通用工具（自动对战模拟器、平衡统计、调试界面）；把项目计划.md 的目标和阶段改成原创方向（等用户定了玩法）
- **不做**：新增或修补复刻内容、仿原作美术
- **worktrees**：`.claude/worktrees/` 里 11 个旧工作区，用户还没说「可以」删，别动

## 当前状态（2026-11-20，自主推进会话）

### 已提交并推送（main）
- 82c1434 Act 3 引擎基础（数据加载、布局、随机形状槽位、Jaw Worm Horde、死亡统一入口 + halfDead、通用效果词、伤害/连击注册、提前结束回合）
- be46ede Artifact 真正生效 + 施加 power 的否决钩子
- 299614b 每回合抽牌数走 modifyDrawPerTurn
- 8fc4acc 补齐从未调用的钩子和 4 种无执行分支的 Action（ADR-10）
- 6963e9e 获得卡牌/遗物统一入口 core/obtain.ts（ADR-11）
- 01705c2 回合结束流程拆到 core/turn.ts
- fcb71df / 065a7a9 / 3ef47b8 Act 3 精英、开场 power 进阶覆盖、Act 3 Boss
- 5f64347 局外遗物 59 个（含 deckSelect 阶段、篝火选项）
- 9bd9c6b 战斗遗物 59 个
- ce7e02e 玩家格挡改为下回合开始才清（之前怪物行动前就清了）
- 9f4ebf6 Act 3 普通怪
- 4be6767 Act 3 接入整局；修 Dual Wield 卡死
- 68919ef Act 3/4 怪物中文名；开场不再给 0 层力量
- 4550541 项目计划.md 同步
- c59f815 剩余 23 种药水（选牌多选界面、从抽牌堆顶打出、按角色药水池、战斗外饮用）
- 48c240c 项目计划.md 同步药水
- 6a9a163 三把钥匙 + Act 4 固定地图（ADR-12）
- c4a1d9f 事件框架：问号房掷骰、事件池、每事件处理函数、事件战斗（ADR-13）
- 0d97094 事件处理函数空文件（给三个子 agent）
- 5f393cc Act 4 怪物（子 agent）：Shield/Spear（Surrounded/Back Attack）、Corrupt Heart
- 0278771 项目计划.md 同步
- 27d3016 Act 2 事件 13 个（子 agent）
- 60261a7 Act 1、神龛、Act 3、一次性事件 38 个（两个子 agent）；全部 51 个事件有处理函数
- 6f573e8 项目计划.md 同步
- de3dd33 局外进阶规则（标题页选进阶；A6/A10/A11/A12/A13/A14/A16/A20 双 Boss）+ 奖励卡升级掷骰
- 1e59ce1 项目计划.md 同步
- 55f6c02 Act 3/4 怪物进阶核对（子 agent）：Darkling Nip、Nemesis 灼伤改 A18、Awakened One A9 血量
- a1a1c3f Act 1/2 怪物进阶核对（子 agent）：9 处进阶 AI；Lagavulin 会睡了、Guardian 防御形态、Slime Boss 会分裂了
- c59c1b7 项目计划.md 同步
- 215c254 伤害动作带来源卡牌：Akabeko（8 层活力）、Pen Nib、Strike Dummy、Phantasmal Killer 生效；虚弱/易伤只在最后取整一次；纸鹤/纸蛙/奇异蘑菇并进倍率
- dd4fc4f Hexaghost Inferno 加 3 张 Burn+ 并升级已有 Burn；Sharp Hide 每张攻击牌一次、可挡；Red Slaver 缠绕每场一次
- b97d592 战斗外死亡：瓶中妖精 / 蜥蜴尾巴照样救；救不回就结束；血之印记挡住休息、换幕、事件、遗物回血
- 1606d7b 药水掉落 65/25/10 稀有度 + 掉落率 ±10 修正（整局保留）
- 58f102f The Boot 改到扣格挡之后生效
- 4ade5d9 火焰之环给活力；腕刃 +4 挪到虚弱之前；完美打击数战斗中三个牌堆 + 自己
- 894d6ee 药水栏满也照掷药水奖励（奖励留着，腾出栏位再拿）；奖励已有 4 项时掉率为 0
- 项目改名「天空竞技场 / Sky Arena」：仓库 Fio-X/sky-arena（公开），网页 https://fio-x.github.io/sky-arena/ ；旧地址 404
- 用户选了路线 1：转成原创牌组构筑游戏（保留引擎，换掉名字/角色/卡牌/怪物/事件/美术）；Claude 不再往复刻内容里加东西

### 现在的数字（实测）
- 可玩：Act 1 → 2 → 3，打完 Act 3 Boss（第 50 层）通关
- 可玩：Act 1 → 4（三把钥匙齐全才进 Act 4）
- 怪物 AI 65/65；遗物 181/181；药水 42/42；事件 51/51
- 进阶 1–20 全部实现（局外 + 65 个怪物逐级核对）
- 测试 1078 个 / 50 文件全过；`npm run check` 通过

## 待你拍板
1. Reptomancer 召唤上限：按规格「存活 < 4」；原版可能是「其他存活 ≤ 3」（推荐查证后再改，一行）
2. ~~Nemesis 灼伤门槛~~ 已按原版改为 A18（55f6c02）
3. Philosopher's Stone 给召唤物 +1 力量：spawnMonster 未实现（推荐补，影响 Gremlin Leader/Collector/Automaton/Reptomancer）
4. ~~Paper Krane / Odd Mushroom 特判~~ 已并进虚弱/易伤倍率（215c254）
5. Smoke Bomb 逃跑后是否触发 onVictory（Burning Blood 回血）：我按「不触发」做的，没查到原版源码（推断）
6. ~~药水掉落权重和 ±10~~ 已做（1606d7b）
7. 最终幕始终开放（原版要先解锁）：推荐保留，否则网页版永远到不了 Act 4
8. Spire Shield & Spear 开场玩家朝右（Shield 在背后），凭记忆，未查源码（推断）
9. 事件里数据和记忆不一致、子 agent 自己选了的（推荐：先按现状，等对拍工具再统一核）：
   - Mind Bloom「I am Rich」金币在 A13 变 25（数据写 A15）
   - Bonfire Spirits 交 Uncommon 回满血（数据写回 10）
   - Knowing Skull 每项起价 6 HP（照 sts_lightspeed；数据写 10% 最大生命、至少 6）
   - Mysterious Sphere 离开什么都不给（照 wiki；lightspeed 给 99 金）
   - Masked Bandits 战斗后照常掷药水（凭记忆；lightspeed 没有）
   - Vampires 选项顺序 接受 / 血瓶 / 拒绝（凭记忆；数据血瓶在前）
10. 自主期间先做了、推荐保留的改动：玩家格挡时机、Artifact、16 个钩子接线、Dual Wield 卡死、怪物身上的 Thorns

## 已知问题（未修）
### 随机数 / 对拍
1. Act 1 精英用 random(int) 而原版用 random() 浮点；Boss 应 Java Collections.shuffle(randomLong)
2. 每层未用 seed+floor 重置 miscRng/shuffleRng/cardRandomRng
3. Act 1 Gremlin Gang 固定 4 只，原版从 8 只池中随机
4. Bronze Orb 偷牌同稀有度排序近似；War Paint/Whetstone、部分遗物抽取的随机数近似

### 战斗规则
5. ~~Slime Boss 从不分裂~~ 已修（a1a1c3f，进阶核对时一并修）
6. 重放（Double Tap/Burst/Echo Form/Amplify）不触发出牌钩子；X 费重放无效；Skewer 不扣能量
7. ~~伤害计算拿不到卡~~ 已修（215c254、58f102f）
8. costForTurn 回合末不重置；Plasma 给的能量被回合能量重置覆盖
9. 回合末弃牌在回合末触发之前；Deep Breath 少洗一次抽牌堆
10. 10 层 Mantra 不进 Divinity；executeRemoveDebuffs 只处理怪物；Speed Potion 的失去敏捷没有钩子
11. Corpse Explosion、Watcher 直接击杀不走死亡入口
12. Wild Strike / Reckless Charge / Pray / Evaluate 应塞到抽牌堆随机位置（`randomSpot` 已支持）
13. 怪物身上的毒和 REGENERATE 结算时机；Calipers 应保留「格挡 − 15」，现在保留 15
14. 原版第 1 回合也触发回合开始遗物；战斗遗物 agent 用 everyTurn 绕过
15. 13 个 Ironclad power 在 corePowers.ts 和 playerPowers.ts 各注册一次

### 局外 / 遗物
16. 精英战不掉遗物；宝箱没有大小和金币
17. ~~Philosopher's Stone、Ectoplasm、Mark of Pain、Velvet Choker 没给 +1 能量~~ 已修（v1.0.0 最后一批）
18. makeDeckCard 忽略升级后的费用；~~篝火/事件回血不查血之印记~~ 已修（b97d592）
19. 商店删牌价格不涨；Dead Branch 用 "RED" 而数据颜色是小写
20. atBattleStartPreDraw、onEnergyRecharge 仍无调用点
21. CardSelectScreen 不支持多选（Gambling Chip、Calculated Gamble）；Cauldron 简化。~~Nilry's Codex、三个 Bottled 遗物需选牌界面~~ 已修（v1.0.0）；Juzu Bracelet 已在 eventRoom.ts 内联实现
22. Looter/Mugger 被击杀不返还金币；事件战斗未实现；事件系统简化（随机移除/升级，无选牌界面）
23. Neow「移除一张牌」写死 STRIKE_RED

### 药水批次顺手发现（未修）
24. Havoc、Mayhem 只把牌放进手牌不自动打出（可改用新的 core/autoplay.ts）
25. Discovery 卡、Wish 是简化版（Discovery 应三选一，可复用 potionDiscovery 选牌）
26. Confused（Snecko Eye）用 cardRng，原版是 cardRandomRng；且应改本场费用而不是只改本回合
27. Calculated Gamble 用了 gamble 选牌任务，原版是整手自动弃掉；现在多选界面会让玩家挑
28. Well-Laid Plans 需要多选，界面还是单选
29. 选牌里的 drawN 不洗牌、不触发 onDraw（Gambling Chip / Gambler's Brew 抽牌）
30. 药水目标永远是 0 号怪（UI 没有选目标），0 号死了药水会打空
31. 充能球槽上限 10 没限制

### Act 4 / 事件框架顺手发现（未修）
32. Invincible（Heart）挡不住绕过 applyDamage 的掉血：毒、Corpse Explosion、Watcher 直接击杀
33. initCombat 给所有角色 3 个充能球槽（应只有 Defect）
34. 燃烧精英增益用状态里的 mapRng 流，原版是地图生成那条流的后续（对拍差异）
35. 事件战斗给的遗物直接入手（引擎没有「可领取的遗物奖励」）；精英战仍不掉遗物
36. 遗物从「随机抽」而不是原版的「开局洗好的遗物池依次弹出」

### 事件批次顺手发现（未修）
37. ~~Lagavulin 开场不睡~~ 已修（a1a1c3f）。原因：eliteAi.ts 查小写 "asleep"，建怪给的是 "ASLEEP"；monsterAi.test.ts 用小写所以没发现（又一个 ADR-5 类问题）
38. ~~战斗外掉到 0 血~~ 已修（b97d592）
39. ~~战斗外回血不查 Mark of the Bloom~~ 已修（b97d592）
40. EventCombatRewards.elite 没人读：Colosseum / Dead Adventurer 的精英战不触发 Black Star、Sling of Courage、Preserved Insect
41. Masked Bandits 的 Red Mask 在奖励页之后单独一屏给（框架没有「奖励页固定遗物」）；Mushrooms 用了新加的 relicIds，可改成同一做法
42. 失去遗物（Golden Idol、N'loth）只是删掉，没有卸下钩子（onUnequip）
43. 事件选项的中文标签里卡牌/遗物/药水名仍是英文（引擎不导入 i18n）
44. Note For Yourself 只在单局内生效（没有跨局存储）

### 进阶批次顺手发现（未修）
45. 卡牌奖励没有稀有度「保底」偏移（cardBlizzRandomizer）：项目计划 3-3 写了 ✅，实际代码里只有固定权重 60/37/3
46. Boss 金币没有原版的 ±5 随机浮动（现为固定 100 / A13 75）
47. 奖励卡升级后描述文字仍显示未升级数值（名字有 +）
48. 进阶 A20 第二个 Boss 从剩余 Boss 里随机抽，原版是开局洗好的 Boss 列表第 2 个（对拍差异）

### 进阶核对顺手发现（未修，子 agent 推荐 49–52 先修）
49. ~~Hexaghost Inferno~~ 已修（dd4fc4f）
50. ~~Sharp Hide~~ 已修（dd4fc4f）
51. 大史莱姆 / Slime Boss 分裂晚一回合（原版立即把意图换成 Split）
52. ~~Red Slaver Entangle~~ 已修（dd4fc4f）；缠绕之后「roll ≥ 50 出 Stab」照 lightspeed，wiki 写 55%（推断，未能查原版）
53. Shield Gremlin / Centurion 给所有队友格挡（原版随机一个；Centurion 独自时给自己）
54. Mystic 治疗判断按单怪、没有「最多连用两次」（不确定）
55. Lagavulin 被打醒后意图显示 Sleep 一回合（原版显示 Stunned，时机相同）
56. Spire Growth A0：连续两次 Quick Tackle 后 roll<50 时原版可能改用 Constrict（凭记忆）

### 本轮（B5–B7、A3）顺手发现（未修）
57. ~~Wreath of Flame 给的 power 没有任何钩子，打出后什么都不发生；应改成给 VIGOR（一行，VIGOR 已实现）~~ 已修（4ade5d9）
58. ~~Wrist Blade 的 +4 在虚弱之后加（遗物钩子排在 power 后面）；原版是 atDamageModify，应挪到新钩子（两行）~~ 已修（4ade5d9）
59. ~~Perfected Strike 数的是整副牌组里的打击；原版数战斗中手牌 + 抽牌堆 + 弃牌堆（战斗中生成/消耗的牌会算错）~~ 已修（4ade5d9）
60. ~~药水栏满时不掷药水奖励（原版照掷、奖励页显示但拿不了）：随机数序列和 ±10 修正都会和原版分叉；「奖励已有 4 项时掉率为 0」也没做~~ 已修（894d6ee）
61. 遗物回血（relicHelpers.heal：Burning Blood、Meat on the Bone 等）在战斗内不吃 Magic Flower；Wallop 不触发 onAttacked 类钩子
62. 笔尖用遗物计数实现，不像原版那样在第 9 次后给玩家挂一个「下一击翻倍」状态，界面上看不到提示

## 下一步（v2.0 — 原创化）
- 复刻阶段 v1.0.0 完成。下一版本目标：在现有引擎上做原创牌组构筑游戏
- 用户还没定玩法方向。建议：先在引擎上做原创小原型快速试错（1 角色、~15 张原创卡、2–3 种怪、1 个核心机制）
- 下面「待你拍板」和「已知问题」是复刻阶段的遗留记录，原创化后大多失效；保留作参考

## 技术关键点
- 纯函数：`step(state, command) → {state, events}`；Command → Action → Event
- 注册表：卡牌效果 / 怪物 AI / power / relic / 药水 / 出招效果（效果词、招式、伤害、连击）/ 死亡拦截 / 建怪 misc 掷骰
- 600 行文件限制；Biome（cognitiveComplexity ≤ 25）；一键门禁 `npm run check`；测试 `npx vitest run`
- dev server：`npm run dev`（端口 5180）；DEV store：`window.__gameStore`（startGame(seed: bigint, character)）
- 测试辅助：`core/fightTestHelpers.ts`；钩子必须有调用点 + 走真实路径的测试（ADR-10）
- 统计注册数：怪物 AI 和遗物部分经循环/封装注册，rg 数不准，用一次性 vitest 脚本数运行时注册表

### 用户授权
- 已授权推送到 GitHub；commit 需要用户明确要求（自主会话期间授权过「门禁和测试通过时提交」；本对话后半段用户在场，按项提交前都复述过目标）
- 子 agent 已授权用于怪物/遗物等批量内容；子 agent 的 git commit 会被权限拒绝，由主会话用 diff 合并
