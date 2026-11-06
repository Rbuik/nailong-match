// cloud-config.js — 云服务连接参数
// 后端：Cloudflare Pages Functions + D1 数据库，跑在游戏域名下的 /api/rpc/*
// 换后端只改这一处 endpoint 即可。
window.NL_CLOUD = {
  endpoint: 'https://nailong-match.pages.dev'
};
