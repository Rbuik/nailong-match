// builtin-music.js — 内置音乐清单（写死在代码里，游戏内无法删除）
//
// 想加歌：往下面 BUILTIN_MUSIC 数组里加一行 { name: '曲名', url: '音频地址' }，
// 保存刷新页面就会出现在「音乐库」最上方，带 🔒 标记，只能播放/加入播放列表，不能删除。
//
// url 支持两种写法：
//   1) './assets/music/xxx.mp3'      本地文件：把音频文件放进 assets/music/ 文件夹（推荐，离线也能放）
//   2) 'https://xxx.com/xxx.mp3'     网络直链：必须是音频文件的直链（链接直接打开就是播放/下载），
//                                    不能是网易云/QQ音乐的网页链接（那种链接拿不到音频文件）
//
// 支持的格式：mp3 / m4a / aac / ogg / wav / flac（取决于设备浏览器）

window.BUILTIN_MUSIC = [
  { name: '奶龙奶龙', url: './assets/music/nailong-nailong.m4a' },
  // { name: '示例歌曲', url: './assets/music/demo.mp3' },
];
