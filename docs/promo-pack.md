# 宣传素材包（可直接复制）

## 一句话（各场景通用）

> **Let your best model lead, cheap models build, a rival vendor review.**
> 让强模型当工头、便宜模型干活、别家厂商审查——DeepSeek Harness 的开源多模型工单插件，又省又好。

## 英文帖（dev 社区：Reddit r/ChatGPTCoding、HN、X）

```
I built deepseek-foreman — an open-source plugin for DeepSeek Harness that turns your strongest model into a tech lead instead of a typist.

It writes tickets, dispatches them to flash-tier models, re-runs acceptance itself, and gets a different vendor to review read-only. Built dogfooded: v0.2–v0.4 were shipped by this very system in one night — 23 tickets, 93%+ of tokens on cheap models, 24 review findings caught.

npm i deepseek-foreman · 3-step setup · beta testers wanted (beginners especially — if the docs lose you, that's a bug)

https://github.com/biantao1108/deepseek-foreman
```

## 中文帖（V2EX、即刻、知乎、掘金）

```
做了个 DeepSeek Harness 插件：deepseek-foreman。
强模型只当工头（拆单/验收/核实），写代码交给 Flash 级便宜模型，换一家厂商做只读审查。
自己就吃自己的狗粮：v0.2→v0.4 全部是这套系统自己迭代发布的——23 张工单一晚，93% token 花在便宜模型上，审查抓了 24 个问题。
三步上手，现在招 Beta 测试（特别欢迎新手：文档看不懂就是 bug）。
github.com/biantao1108/deepseek-foreman
```

## 发布节奏建议

| 时机 | 动作 |
|---|---|
| 今天 | README Beta 区块 + Issue 模板上线；X/即刻发首帖；Hacker News Show HN（北京时间晚 10 点 = 美东早 9 点） |
| 本周 | V2EX 分享创造 + Reddit r/ChatGPTCoding；给 opus-manager 上游提个 discussion 互链（礼貌引荐） |
| 有 5 个测试者后 | 发《beta field report》博客/帖：真实外部用户的成本数据（最有说服力的宣传素材） |

## 传播钩子（按说服力排序）

1. **自举事实**：产品是用产品造的（23 单一晚，账本公开）
2. **93% token 在便宜模型**：一张图说清（看板图）
3. **审查真抓到高危**：私有路由名泄露被拦——质量闭环不是摆设
4. **小白可上手**：setup 向导 + doctor 说人话
5. **诚恳**：哪些没测就不吹（A/B 留给 Beta 一起做）
