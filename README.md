# 奶龙消消乐

纯前端三消小游戏，主线 80 关。

在线玩：https://nailong-match.pages.dev

## 目录

- `_backend/` — 云端账号接口（Cloudflare Pages Functions）
  - `_worker.js` 登录 / 读档 / 存档接口
  - `schema.sql` 表结构
- `_preview/` — 预览与调试页
  - `*.html` 单页预览（盘面、成就、章节地图等）、`*.png` 对应截图
- `_sql/` — 数据库脚本
  - `1_register.sql`、`2_login.sql`、`3_load.sql`、`4_save.sql`
- `assets/` — 贴图与音乐
  - `0~5.jpg / .webp` 六种方块图案、`rainbow*.jpg` 彩杯填充、`nailong.png` 吉祥物、`music/` 内置歌曲
- `css/` — 样式
  - `style.css` 页面布局、`themes.css` 主题配色与各面板组件
- `js/` — 游戏逻辑
  - `game.js` 主控（棋盘、交换、消除、动画、结算、面板）、`levels.json` 80 关数据
  - `specials.js` 特殊块生成与融合、`goals.js` 关卡目标、`board.js` 棋盘、`meta.js` 元数据
  - `storage.js` 存档与钱包、`tasks.js` 每日任务与商店、`input.js` 输入、`rng.js` 随机、`effects.js` 特效
  - `account.js` / `cloud.js` / `mail.js` 账号、云存档、邮箱
  - `audio.js` / `music.js` / `builtin-music.js` 音效与音乐
- `.gen-preview.js` — 批量生成预览图
- `.gitattributes` / `.gitignore` — Git 配置
- `04e09ed9f0027f5098706fd59f75b873.txt` / `969204503f687f55d49123a656b135b9.txt` — 文本附件（哈希记录）
- `README.md` — 本说明
- `_gen-chaptermap.js` — 生成章节地图预览页
- `_gen-levels.js` — 生成 41~80 关数据
- `index.html` — 页面骨架与所有面板
- `project.config.json` / `project.private.config.json` — 微信开发者工具配置
- `test-longpress.js` — 播放列表长按拖动测试
- `test-smoke.js` — 无头冒烟测试
