/* ============================================================
 * xinmo.work · Supabase 配置
 * ------------------------------------------------------------
 * publishable key（sb_publishable_…）本来就是给浏览器用的公开密钥，
 * 真正管权限的是数据库里的 RLS 策略 + GRANT：
 *   - 读取：允许 anon 读 public.tools
 *   - 写入：允许 anon 只 insert、不给 update/delete
 * 所以这个文件可以安全地随站点公开部署。
 * ============================================================ */
window.XINMO_SUPABASE = {
  url: "https://monwlglwpwwbejrifwmj.supabase.co",
  key: "sb_publishable_ruUIXDxjj_LyZysCMf0_FQ_2ewm-cRq",
  table: "tools",          // 朋友提交的「链接」
  uploadsTable: "uploads", // 朋友上传的「资料」（文件 + 文字）
  bucket: "uploads"        // Supabase Storage 存储桶
};
