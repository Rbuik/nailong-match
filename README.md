# 奶龙消消乐 · Nailong Match

纯前端三消小游戏，无框架、无构建、无依赖。

## 运行

- 直接双击 `index.html`：`levels.json` 会被浏览器拦截，自动用 `js/game.js` 里的 `LEVELS_FALLBACK` 兜底，玩法一致。
- 想改关卡生效就起个静态服务：`python -m http.server 8000`，打开 `http://localhost:8000`。

## 玩法

- **交换**：点选再点相邻块，或拖到相邻格；长按可多选。
- **目标**：分数 / 收集方块（每次开局随机两种图案）/ 果冻格 / 限时 / 极限步数 / 敲冰块（2 层起，厚冰 3 层）/ 运钥匙 🔑 / 护送奶龙。
- **障碍**：冰块冻住的块不能动，靠相邻消除砸开；锁链消一次解链；货物贴在块上跟着下落，落到最底行才算送达。
- **特殊块**：横/竖 4 连出线消，L/T 出炸弹，5 连出彩虹；两个特殊块相邻交换触发组合技。
- **其他**：连击倍率、4 连击狂热、每局 3 次提示、失败可花金币续命、可撤回、切后台自动暂停、1~3 星。
- **内容**：主线 40 关 4 章；更多玩法（无尽 / 60 秒 / 节奏）；每日挑战（日期做种子）；成就 19 枚五阶、棋盘配色 8 款、福利中心、排行榜（总榜 / 省榜 / 局榜）。

## 账号与邮箱

- 本机多账号（`js/account.js`）：进入先登录 / 注册，名字唯一、4~24 位密码，名字含敏感词会被拦。名字 + 密码同时存在云数据库（`js/cloud.js`，WorkBuddy 云服务），换设备 / 清缓存后用同一个名字密码登录会把存档拉回来；云端不可达时静默降级为纯本机；云端上线前建的老号在下次登录时也会自动建档搬上服务器。
- 设置 → 账号安全：切换账号 / 修改密码 / 注销账号（彻底删除本机存档、邮箱、进度、金币，不可恢复）。
- 主页 🏠 下面的 📮 是邮箱（`js/mail.js`）：系统公告和奖励都发到这里，带附件的邮件点「领取」才到账；左滑删除，返回上面有一键已读 / 一键删除。
- 发奖励：`js/account.js` 的 `GRANTS` 加一条（名字不分大小写、每账号一次），邮件正文在 `Mail.SYSTEM_MAILS`。

## 目录

```
index.html        页面骨架 + 所有面板
css/              style.css 基础布局、themes.css 主题与组件
js/game.js        主控：棋盘、交换、消除、动画、结算、面板
js/levels.json    40 关数据
js/{meta,board,music,audio,builtin-music,storage,tasks,specials,goals,effects,input,rng,account,mail}.js
assets/           六种方块贴图（webp，512×512，单张 25-80KB）+ music/
test-smoke.js     无头冒烟测试（node test-smoke.js）
test-longpress.js 播放列表长按拖动测试（node test-longpress.js）
```

脚本加载顺序（`index.html` 底部）不能乱：`rng → storage → audio → effects → specials → goals → tasks → mail → input → builtin-music → music → meta → account → board → game`。

## 存档

全部在 `localStorage`，前缀 `nl2:`；每个账号一份快照 `nl2:acc:<id>`，切换时与当前数据互相倒腾。设备级 key：`nl2:accounts` / `nl2:cur` / `nl2:comp` / `nl2:visits` / `nl2:net` / `nl2:lb-del` / `nl2:statsVer` / `nl2:acc:*`，注销和切换都不动它们。

## 已知限制

- 排行榜走 ntfy.sh 公共主题（`nailong-lb-9k2v7h4q`），SSE 实时收更新 + 本地缓存；中转只留约 12 小时，客户端定期合成整榜快照。`file://` 和 localhost 不发布成绩（防测试污染）。
- `file://` 下读不到 `levels.json`，走内置数据兜底。
- `_legacy/` 是重构前的单文件旧版，仅作参考，已加入 `.gitignore`。
