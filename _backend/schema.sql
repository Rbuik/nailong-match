-- 奶龙消消乐：账号库（Cloudflare D1 / SQLite）
CREATE TABLE IF NOT EXISTS accounts (
  id          TEXT PRIMARY KEY,        -- 玩家身份码
  nick_key    TEXT NOT NULL UNIQUE,    -- 小写名字，用来判重 / 登录查找
  nick        TEXT NOT NULL,           -- 显示用名字
  pass        TEXT NOT NULL,           -- pbkdf2$迭代次数$盐$哈希
  slot        TEXT,                    -- 存档 JSON 文本
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  acc_id     TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_acc ON sessions(acc_id);

-- 每日挑战榜单（服务端）：每天 00:00（北京时间）清场，每人只留最好的一条
CREATE TABLE IF NOT EXISTS daily_board (
  uid   TEXT PRIMARY KEY,
  name  TEXT NOT NULL,
  stars INTEGER NOT NULL,
  moves INTEGER NOT NULL,
  ts    INTEGER NOT NULL,
  day   TEXT NOT NULL
);

-- 已注销 / 隐藏的名字（客户端上报，服务端不下发这些人）
CREATE TABLE IF NOT EXISTS hidden_names (
  nick_key TEXT PRIMARY KEY
);
