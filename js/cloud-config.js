// cloud-config.js — 云服务连接参数
// 来源：WorkBuddy 云服务开通时下发的 publicConfig（应用「奶龙消消乐」wbapp_3OcL9IQs2tKxGyMDP9dOEo）
// 说明：这几个值只用于识别"是哪个应用"，本身不带权限；服务端会校验来源域名，
//       所以只有发布后的托管域名（以及本地调试白名单）能真正调通。
window.NL_CLOUD = {
  endpoint: 'https://nailong-match.app.workbuddy.host',
  oauthRelayBaseUrl: 'https://www.workbuddy.cn/v2/as/genie-baas/oauth',
  publishableKey: 'wbpk_3OcL9IQs2tKxGyMDP9dOEo_ZPMcm5ZlLahHd4lW4tEjg0gCb0MbsIfK'
};
