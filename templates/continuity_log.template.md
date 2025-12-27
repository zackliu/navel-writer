```markdown
# 连续性账本（Continuity Log）

> 版本：0.2（加入剧情线账本：短/中/长线可审计；线索必须挂线；每章更新计时器与压力）
>
> 变更说明：
> - 0.2：新增 D) 剧情线账本；扩展 B/C 与剧情线强关联；把“风险”具体化为“谁能拿什么来做什么、何时会触发”。

---

## A) 禁改事实表（发生过就不能反悔）

| ID | 事实（可追责） | 时间点 | 责任主体/见证/记录 | 备注 |
|---|---|---:|---|---|
| F-001 | {{FACT_001}} | pre-story | {{F001_PROOF}} |  |
| F-002 | {{FACT_002}} | pre-story | {{F002_PROOF}} |  |

---

## B) 未解线索表（所有伏笔都在这里排队）

> 状态：planned（规划）/ seeded（已埋）/ open（已开启）/ resolved（已回收）/ burned（已暴露不可再用）

| ID | 状态 | 起始章 | 线索（可验证实体） | 挂靠剧情线（D-xx） | 计划（埋/推/收章） | 当前持有人/知情者 | 备注 |
|---|---|---:|---|---|---|---|---|
| CL-01 | planned | 01 | {{CLUE_01}} | {{CLUE_01_LINE}} | {{CLUE_01_PLAN}} | {{CLUE_01_HOLDER}} |  |
| CL-02 | planned | 01 | {{CLUE_02}} | {{CLUE_02_LINE}} | {{CLUE_02_PLAN}} | {{CLUE_02_HOLDER}} |  |
| CL-03 | planned | 01 | {{CLUE_03}} | {{CLUE_03_LINE}} | {{CLUE_03_PLAN}} | {{CLUE_03_HOLDER}} |  |

> 规则：
> - 线索必须是“实体”：记录、证据、债务、物件、目击、承诺、伤痕、口供……不能只是“某人想法”。
> - 每条线索必须挂靠至少一条剧情线（D-xx），否则视为无意义伏笔。
> - 线索不能“无声消失”：若暂时搁置，状态必须仍为 seeded/open，并写清楚是谁压住、凭什么压得住、压不住会怎样。

---

## C) 人物状态表（每章后更新但不能漂移）

| 人物 | 当前目标（下一步要做什么） | 关系债务（欠/被欠：对象+凭据） | 伤疤/不可逆代价（可指认） | 受哪条线咬住（D-xx） | 计时器/触发点（何时会更糟） |
|---|---|---|---|---|---|
| {{CHAR_1_NAME}} | {{CHAR_1_GOAL}} | {{CHAR_1_DEBTS_PROOF}} | {{CHAR_1_SCAR_PROOF}} | {{CHAR_1_LINES}} | {{CHAR_1_TIMER}} |
| {{CHAR_2_NAME}} | {{CHAR_2_GOAL}} | {{CHAR_2_DEBTS_PROOF}} | {{CHAR_2_SCAR_PROOF}} | {{CHAR_2_LINES}} | {{CHAR_2_TIMER}} |
| {{CHAR_3_NAME}} | {{CHAR_3_GOAL}} | {{CHAR_3_DEBTS_PROOF}} | {{CHAR_3_SCAR_PROOF}} | {{CHAR_3_LINES}} | {{CHAR_3_TIMER}} |


---

## D) 剧情线账本（短/中/长线必须可审计）

> 线类型：S（短线：章章在动的压力/计时） / M（中线：多章汇聚爆点） / L（长线：全书终局）
>
> 状态：armed（已上膛）/ running（运转中）/ escalating（加压中）/ converging（汇聚中）/ detonated（爆点已发生）/ closed（已结束）/ transformed（形态改变并转挂别线）

| ID | 类型 | 状态 | 线的“可利用物”（债务/证据/承诺/伤害/规则） | 当前压力（谁在逼谁，用什么逼） | 计时器（截止/窗口/条件） | 最近一次推进章 | 下一次必须回应的点（更尖的问题） | 汇聚到哪条更大线（M/L） |
|---|---|---|---|---|---|---:|---|---|
| D-01 | L | armed | {{D01_CORE_OBJECT}} | {{D01_PRESSURE}} | {{D01_TIMER}} | 00 | {{D01_NEXT_QUESTION}} |  |
| D-02 | M | armed | {{D02_CORE_OBJECT}} | {{D02_PRESSURE}} | {{D02_TIMER}} | 00 | {{D02_NEXT_QUESTION}} | D-01 |
| D-03 | S | running | {{D03_CORE_OBJECT}} | {{D03_PRESSURE}} | {{D03_TIMER}} | 01 | {{D03_NEXT_QUESTION}} | D-02 |


---

## E) 章节更新记录（用于对照 outline 与账本）

| 章 | 新增禁改事实（F-xx） | 新增/推进线索（CL-xx） | 新增不可逆代价（人物/组织） | 推进的剧情线（D-xx） | 本章末尾悬置问题（应对 D-xx 的 NEXT） |
|---|---|---|---|---|---|
| 01 | {{CH01_FACTS}} | {{CH01_CLUES}} | {{CH01_COSTS}} | {{CH01_LINES}} | {{CH01_QUESTION}} |
| 02 | {{CH02_FACTS}} | {{CH02_CLUES}} | {{CH02_COSTS}} | {{CH02_LINES}} | {{CH02_QUESTION}} |
| 03 | {{CH03_FACTS}} | {{CH03_CLUES}} | {{CH03_COSTS}} | {{CH03_LINES}} | {{CH03_QUESTION}} |
```
