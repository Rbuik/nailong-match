# 果冻消消乐 · Jelly Match

一个用原生 HTML5 Canvas + JavaScript 写的三消小游戏，无任何依赖，打开就能玩。

![玩法预览](https://img.shields.io/badge/play-online-brightgreen)
![license](https://img.shields.io/badge/license-MIT-blue)
![no-deps](https://img.shields.io/badge/dependencies-0-orange)

## 在线试玩

👉 **https://你的用户名.github.io/jelly-match/**

## 玩法

- 点击一个方块选中，再点击**相邻**方块交换位置
- 横向或纵向连成 **3 个及以上**同色方块即消除
- 消除后上方方块下落、顶部补充新方块，可能触发**连锁消除**
- 每次连锁得分倍率递增（第 n 次连锁 ×n）
- 共 **30 步**，步数用完本局结束
- 无可行走法时自动洗牌

## 特性

- ✅ 纯前端，零依赖，单文件逻辑清晰
- ✅ 交换 / 消除 / 下落三段动画
- ✅ 连击分数加成
- ✅ 死局自动检测与洗牌
- ✅ 手机自适应，支持触摸
- ✅ 开局保证无三连
