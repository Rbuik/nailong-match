# 奶龙消消乐 · Nailong Match

纯前端三消小游戏，无框架、无构建、无依赖。

## 运行

- 直接双击 `index.html`：`levels.json` 会被浏览器拦截，自动用 `js/game.js` 里的 `LEVELS_FALLBACK` 兜底，玩法一致。
- 想改关卡生效就起个静态服务：`python -m http.server 8000`，打开 `http://localhost:8000`。

## 玩法

- **交换**：点选再点相邻块，或拖到相邻格；长按可多选。
- **目标**：分数 / 收集方块（每次开局随机两种图案，「继续游戏」恢复本局不重挑，消掉的目标方块实时计数）/ 果冻格 / 限时 / 极限步数 / 敲冰块（2 层起，厚冰 3 层）/ 运钥匙 🔑 / 护送奶龙。
- **障碍**：冰块冻住的块不能动，靠相邻消除砸开；锁链消一次解链；货物贴在块上跟着下落，落到最底行才算送达。
- **特殊块**：横/竖 4 连出线消，L/T 出炸弹，5 连出彩虹；两个特殊块相邻交换触发组合技。引爆有专属特效（`js/effects.js`）：炸弹火球冲击波 + 全屏闪光 + 震屏，线消蓝光束横 / 竖扫过，彩虹五色波纹 + 白闪。棋盘方块底色用各自图案色加深 25%（`tileBaseColor`），不再是黑色。
- **其他**：连击倍率、4 连击狂热、每局 3 次提示、失败可花金币续命、可撤回、切后台自动暂停、1~3 星。主页「📍 当前进度」跟随最后进入的关卡（`startLevel` 写入 `settings.menuLevel`），从哪关出去主页就停在哪关。
- **内容**：主线 40 关 4 章；更多玩法（无尽 / 60 秒 / 节奏）；每日挑战（日期做种子）；成就 27 枚五阶、棋盘配色 8 款（第 8 款「彩色」彩虹光晕）、签到入口（日期条签到 + 转盘）、排行榜（总榜 / 省榜 / 局榜）。

## 账号与邮箱

- 本机多账号（`js/account.js`）：进入先登录 / 注册，名字唯一、4~24 位密码，名字含敏感词会被拦。**登录 / 注册 / 补资料页面不播背景音乐**，进主界面后才有。
- 云端账号（`js/cloud.js` + `js/cloud-config.js`）：后端是 Cloudflare Pages Functions + D1 数据库，接口 `${endpoint}/api/rpc/nl_*`（`register` / `login` / `load` / `save` / `setpass`），密码 PBKDF2-SHA256 加盐存库、明文不落库。登录成功后本地账号静默建档上云，进度每 30 秒推一次、`pagehide` 再强推一次；换设备 / 清缓存后用同一个名字密码登录即拉回存档。云端不可达时静默降级为纯本机，不影响游玩。
- 设置 → 账号安全：切换账号 / 修改密码 / 注销账号（彻底删除本机存档、邮箱、进度、金币，不可恢复）。
- 存档码（`Account.exportBackup` / `importBackup`）：两处入口分工——账号安全页「💾 存档码」只有生成框 + 生成 / 复制（生成后压成一段 `NL2BK1.` 开头的文本，含全部账号 + 各号进度）；登录页「💾 导入存档码」只有粘贴框 + 导入 / 返回。换网址 / 换设备 / 微信清缓存后粘回去即可整份搬回（合并式，同 id 覆盖）。
- 主页 🏠 下面的 📮 是邮箱（`js/mail.js`）：系统公告和奖励都发到这里，带附件的邮件点「领取」才到账；左滑出小删除键（轻点不会误触露出），点邮件直接打开详情，一键删除先弹确认窗口。邮件标题带「：」时，详情页自动拆成主标题 + 副标题（副标题单独一行、字号更小），详情页主标题不带 emoji，列表仍显示完整标题。
- 音乐（`js/music.js`）：**系统自带歌曲只放在音乐库**（历史导入里没有）；历史导入和音乐库各存一份（`nl2:musicHistory` / `nl2:musicLibrary`），**删除互不同步**；导入的音频两边都进。恢复默认音乐先弹确认窗口。
- 按钮配色：蓝 / 红 / 绿键都是「注销账号」那种描边效果（各自颜色），其余普通键黑色描边；棋盘选中框是黑色（`game.js` 用 `#333`）。所有确认窗口统一：肯定（红）在左、否定（绿）在右，按钮同大。
- 签到（`js/storage.js` + `js/game.js`）：日期条按真实日期显示、横向滑动，本轮 7 天 + 多显示 3 天；签到了绿色、今天虚线框、漏签红色（点击弹补签窗口，`Store.makeupSign(dateKey)` 指定补哪天，300 金币/天）。连续签到天数在签到键上面（黑色）。第 8 款棋盘配色「彩色」：id 仍是 `black`（兼容老存档），meta.js 里改名彩色 + 彩虹光晕。
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
