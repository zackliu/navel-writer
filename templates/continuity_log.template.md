# `continuity_log.md` 模板（已对齐 outline 的“关门/代价/换形”要求）

# 连续性账本（Continuity Log）

> 版本：0.3（与 outline 对齐：关门句可审计；代价类型与换形可追踪；少数载重钉子贯穿全书并回声）
>
> 变更说明：
> - 0.3：强化“关门句”落地：硬关门→F/CL/D 必有落点；软关门→C 表必须写策略更新；新增“代价类型/换形”在 D 表中可追踪。

---

## A) 禁改事实表（发生过就不能反悔）

| ID | 事实（可追责/不可反悔） | 时间点（章/日期） | 可指认点（见证/物证/记录） | 关联关门（硬/软 + 对应章） | 备注 |
|---|---|---:|---|---|---|
| F-001 | {{FACT_001}} | pre-story | {{F001_PROOF}} | {{F001_DOOR_REF}} |  |
| F-002 | {{FACT_002}} | pre-story | {{F002_PROOF}} | {{F002_DOOR_REF}} |  |

---

## B) 未解线索表（所有伏笔都在这里排队）

> 状态：planned / seeded / open / resolved / burned

| ID | 状态 | 起始章 | 线索（可验证实体） | 挂靠剧情线（D-xx） | 计划（埋/推/收章） | 当前持有人/知情者（可用方式） | 关联关门（硬/软 + 对应章） | 备注（压住/压不住会怎样） |
|---|---|---:|---|---|---|---|---|---|
| CL-01 | planned | 01 | {{CLUE_01}} | {{CLUE_01_LINE}} | {{CLUE_01_PLAN}} | {{CLUE_01_HOLDER_USE}} | {{CLUE_01_DOOR_REF}} |  |
| CL-02 | planned | 01 | {{CLUE_02}} | {{CLUE_02_LINE}} | {{CLUE_02_PLAN}} | {{CLUE_02_HOLDER_USE}} | {{CLUE_02_DOOR_REF}} |  |
| CL-03 | planned | 01 | {{CLUE_03}} | {{CLUE_03_LINE}} | {{CLUE_03_PLAN}} | {{CLUE_03_HOLDER_USE}} | {{CLUE_03_DOOR_REF}} |  |

---

## C) 人物状态表（每章后更新但不能漂移）

> 要求：此表必须记录“软关门”的策略更新（可验证句式），并与 D/E 表可追溯。

| 人物 | 当前目标（下一步要做什么） | 防御/策略更新（软关门句式：从此在X会Y/不再Z） | 关系债务（欠/被欠：对象+凭据+追讨方式） | 伤疤/不可逆代价（可指认） | 受哪条线咬住（D-xx） | 计时器/触发点（可触发条件） |
|---|---|---|---|---|---|---|
| {{CHAR_1_NAME}} | {{CHAR_1_GOAL}} | {{CHAR_1_DEFENSE_UPDATE}} | {{CHAR_1_DEBTS_PROOF}} | {{CHAR_1_SCAR_PROOF}} | {{CHAR_1_LINES}} | {{CHAR_1_TIMER}} |
| {{CHAR_2_NAME}} | {{CHAR_2_GOAL}} | {{CHAR_2_DEFENSE_UPDATE}} | {{CHAR_2_DEBTS_PROOF}} | {{CHAR_2_SCAR_PROOF}} | {{CHAR_2_LINES}} | {{CHAR_2_TIMER}} |
| {{CHAR_3_NAME}} | {{CHAR_3_GOAL}} | {{CHAR_3_DEFENSE_UPDATE}} | {{CHAR_3_DEBTS_PROOF}} | {{CHAR_3_SCAR_PROOF}} | {{CHAR_3_LINES}} | {{CHAR_3_TIMER}} |

---

## D) 剧情线账本（短/中/长线必须可审计）

> 线类型：S / M / L
>
> 状态：armed / running / escalating / converging / detonated / closed / transformed
>
> 说明：
> - “代价类型”必须写在“可利用物/当前压力/NEXT”里（用明确词汇：信息/安全/身份/关系/资源/时间/能力/因果等）。
> - 若发生“代价换形”，必须把“从A→B”写清楚，并标注换形后行动风格变化（并在 C 表对应人物写策略更新）。

| ID | 类型 | 状态 | 代价类型（主/次） | 线的“可利用物”（债务/证据/承诺/规则/伤害） | 当前压力（谁在逼谁，用什么逼） | 计时器（截止/窗口/条件） | 最近一次推进章 | 下一次必须回应的点（可被拿来做事） | 汇聚到哪条更大线（M/L） |
|---|---|---|---|---|---|---|---:|---|---|
| D-01 | L | armed | {{D01_COST_TYPES}} | {{D01_CORE_OBJECT}} | {{D01_PRESSURE}} | {{D01_TIMER}} | 00 | {{D01_NEXT_QUESTION}} |  |
| D-02 | M | armed | {{D02_COST_TYPES}} | {{D02_CORE_OBJECT}} | {{D02_PRESSURE}} | {{D02_TIMER}} | 00 | {{D02_NEXT_QUESTION}} | D-01 |
| D-03 | S | running | {{D03_COST_TYPES}} | {{D03_CORE_OBJECT}} | {{D03_PRESSURE}} | {{D03_TIMER}} | 01 | {{D03_NEXT_QUESTION}} | D-02 |

---

## E) 章节更新记录（用于对照 outline 与账本）

> 要求：每章必须至少填入一种“关门”更新（硬或软），并且能在 A/B/C/D 中找到对应落点。

| 章 | 本章关门类型（硬/软） | 对应关门句摘要（1句） | 新增禁改事实（F-xx） | 新增/推进线索（CL-xx） | 策略更新（若软关门，写“从此在X会Y/不再Z”） | 新增不可逆代价（人物/组织） | 推进的剧情线（D-xx） | 本章末尾悬置问题（对齐 D-xx 的 NEXT） |
|---|---|---|---|---|---|---|---|---|
| 01 | {{CH01_DOOR_TYPE}} | {{CH01_DOOR_SUMMARY}} | {{CH01_FACTS}} | {{CH01_CLUES}} | {{CH01_DEFENSE_UPDATE}} | {{CH01_COSTS}} | {{CH01_LINES}} | {{CH01_QUESTION}} |
| 02 | {{CH02_DOOR_TYPE}} | {{CH02_DOOR_SUMMARY}} | {{CH02_FACTS}} | {{CH02_CLUES}} | {{CH02_DEFENSE_UPDATE}} | {{CH02_COSTS}} | {{CH02_LINES}} | {{CH02_QUESTION}} |
| 03 | {{CH03_DOOR_TYPE}} | {{CH03_DOOR_SUMMARY}} | {{CH03_FACTS}} | {{CH03_CLUES}} | {{CH03_DEFENSE_UPDATE}} | {{CH03_COSTS}} | {{CH03_LINES}} | {{CH03_QUESTION}} |
