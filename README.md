# 奶龙消消乐 · Nailong Match

一个用原生 HTML5 Canvas + JavaScript 写的三消小游戏，无任何依赖，打开就能玩。<br>
![play](https://img.shields.io/badge/play-online-brightgreen)
![license](https://img.shields.io/badge/license-MIT-blue)
![no-deps](https://img.shields.io/badge/dependencies-0-orange)

## 在线试玩

👉 **https://rbuik.github.io/nailong-match/**

## 玩法

- 点击一个方块选中，再点击**相邻**方块交换位置
- 横向或纵向连成 **3个及以上**同色方块即消除
- 消除后上方方块下落、顶部补充新方块，可能触发**连锁消除**
- 每次连锁得分倍率递增（第n次连锁×n）
- 共 **30步**，步数用完本局结束
- 无可行走法时自动洗牌

## 特性

- ✅ 纯前端，零依赖，逻辑清晰
- ✅ 图片方块，可自定义素材
- ✅ 交换 / 消除 / 下落三段动画
- ✅ 连击分数加成
- ✅ 死局自动检测与洗牌
- ✅ 手机自适应，支持触摸
- ✅ 开局保证无三连

## 项目结构

```text
nailong-match/
├── assets/
│   ├── 0.png
│   ├── 1.png
│   ├── 2.png
│   ├── 3.png
│   ├── 4.png
│   └── 5.png
├── css/
│   └── style.css
├── js/
│   └── game.js
├── README.md
└── index.html
```
