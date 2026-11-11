# 奶龙消消乐

纯前端三消小游戏。

在线玩：https://rbuik.github.io/nailong-match/

## 目录

```text
├── _backend/                             # 云端账号接口（Cloudflare Pages Functions）
│   ├── _worker.js                        # 登录 / 读档 / 存档接口
│   └── schema.sql                        # 表结构
├── _preview/                             # 预览与调试页
│   ├── *.html                            # 单页预览（盘面、成就、章节地图等）
│   └── *.png                             # 对应截图
├── _sql/                                 # 数据库脚本
│   ├── 1_register.sql                    # 注册
│   ├── 2_login.sql                       # 登录
│   ├── 3_load.sql                        # 读档
│   └── 4_save.sql                        # 存档
├── assets/                               # 贴图与音乐
│   ├── 0~5.jpg / 0~5.webp                # 六种方块图案
│   ├── rainbow.jpg / rainbow-cup.jpg     # 彩杯与彩虹填充
│   ├── nailong.png                       # 吉祥物
│   └── music/                            # 内置歌曲
├── css/                                  # 样式
│   ├── style.css                         # 页面布局
│   └── themes.css                        # 主题配色与各面板组件
├── js/                                   # 游戏逻辑
│   ├── game.js                           # 主控（棋盘、交换、消除、动画、结算、面板）
│   ├── levels.json                       # 80 关数据
│   ├── specials.js                       # 特殊块生成与融合
│   ├── goals.js                          # 关卡目标
│   ├── board.js                          # 棋盘
│   ├── meta.js                           # 成就 / 统计元数据
│   ├── storage.js                        # 存档、钱包与金币明细
│   ├── tasks.js                          # 每日任务与商店
│   ├── input.js                          # 触摸与点击输入
│   ├── rng.js                            # 随机数
│   ├── effects.js                        # 粒子与特效
│   ├── account.js                        # 本机多账号
│   ├── cloud.js                          # 云存档
│   ├── mail.js                           # 邮箱
│   ├── audio.js                          # 音效
│   ├── music.js                          # 音乐播放器
│   └── builtin-music.js                  # 内置歌曲数据
├── .gen-preview.js                       # 批量生成预览图
├── .gitattributes                        # Git 换行符规则
├── .gitignore                            # Git 忽略清单
├── 04e09ed9f0027f5098706fd59f75b873.txt  # 文本附件（哈希记录）
├── 969204503f687f55d49123a656b135b9.txt  # 文本附件（哈希记录）
├── README.md                             # 本说明
├── _gen-chaptermap.js                    # 生成章节地图预览页
├── _gen-levels.js                        # 生成 41~80 关数据
├── index.html                            # 页面骨架与所有面板
├── project.config.json                   # 微信开发者工具配置
├── project.private.config.json           # 微信开发者工具私有配置
├── test-longpress.js                     # 播放列表长按拖动测试
└── test-smoke.js                         # 无头冒烟测试
```

## 玩法补充

- 🛒 购物商店：左右滑动切换道具；也可以用手指在商品下面的小圆点上左右滑动，商品会跟着一起滑。第一件和最后一件首尾相接，可以一直转圈。
