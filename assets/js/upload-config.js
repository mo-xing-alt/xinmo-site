/* 上传页配置
 * --------------------------------------------------------------
 * token：一个「只写本仓库、无删除权限」的 GitHub 细粒度令牌。
 *   该令牌会被部署到公开站点（任何能看到页面源码的人都能拿到），
 *   因此必须严格限权，且随时可在 GitHub 一键吊销、轮换。
 *   创建方法见 COMMANDS.md 的「启用朋友自助上传」一节。
 *
 * ⚠️ 把下面这行换成真实令牌；部署时也可不改本文件，
 *    改用环境变量 XINMO_UPLOAD_TOKEN 注入（见 deploy_github.py）。
 *    本地请始终保持下面这个占位值，别把真实令牌提交到其它地方。
 */
window.XINMO_UPLOAD = {
  apiBase: "https://api.github.com",
  owner: "mo-xing-alt",
  repo: "xinmo-site",
  branch: "main",
  token: "REPLACE_WITH_FINE_GRAINED_TOKEN"
};
