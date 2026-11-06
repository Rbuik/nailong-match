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
