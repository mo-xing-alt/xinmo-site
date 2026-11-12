/* 页面守卫：同步、尽早执行。未登录直接跳登录页，子页面同样受保护。
 * 注意：这是前端拦截，只挡随手访问；静态文件本身仍可从公开 URL 获取。 */
(function () {
  'use strict';
  // 防点击劫持：GitHub Pages 无法设置 X-Frame-Options，这里用 JS 兜底；被 iframe 嵌入时跳到顶层。
  try {
    if (window.top !== window.self) { window.top.location = window.self.location.href; return; }
  } catch (e) { document.documentElement.style.display = 'none'; }
  var cfg = window.XINMO_ACCESS;
  if (!cfg || !cfg.accounts || !cfg.accounts.length || !cfg.gate) return;

  var src = (document.currentScript && document.currentScript.src) || '';
  var marker = 'assets/js/guard.js';
  var at = src.indexOf(marker);
  var root = at >= 0 ? src.slice(0, at) : '/';
  var KEY = 'xinmo_access';

  function read() {
    try { return JSON.parse(localStorage.getItem(KEY) || 'null'); }
    catch (e) { return null; }
  }

  var s = read();
  var ok = s && s.t === cfg.gate && s.exp && s.exp > Date.now();
  if (!ok) {
    try { localStorage.removeItem(KEY); } catch (e) {}
    location.replace(root + 'login.html?next=' + encodeURIComponent(location.href));
    return;
  }

  document.addEventListener('DOMContentLoaded', function () {
    var compact = !!(window.matchMedia && window.matchMedia('(max-width: 640px)').matches);
    var a = document.createElement('a');
    a.href = '#';
    a.className = 'xinmo-logout';
    a.textContent = '退出';
    a.setAttribute('aria-label', '退出登录');
    a.setAttribute('title', '退出登录');
    var base = 'position:fixed;z-index:99998;text-decoration:none;' +
      'font:11px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif;';
    /* 手机端改成右下角 42px 实心圆钮：不再半透明地压在正文文字上，
       并避开 iPhone 底部安全区，保证有足够大的点击区域。 */
    a.style.cssText = base + (compact
      ? 'right:12px;bottom:calc(12px + env(safe-area-inset-bottom, 0px));' +
        'width:42px;height:42px;display:grid;place-items:center;border-radius:50%;' +
        'color:#fff;opacity:.92;background:rgba(140,15,20,.92);' +
        'border:1px solid rgba(255,255,255,.42);box-shadow:0 4px 14px rgba(60,3,6,.32);'
      : 'right:14px;bottom:14px;color:inherit;opacity:.38;padding:5px 9px;border-radius:8px;' +
        'background:rgba(127,127,127,.10);');
    if (!compact) {
      a.addEventListener('mouseenter', function () { a.style.opacity = '.8'; });
      a.addEventListener('mouseleave', function () { a.style.opacity = '.38'; });
    }
    a.addEventListener('click', function (e) {
      e.preventDefault();
      try { localStorage.removeItem(KEY); } catch (err) {}
      location.href = root + 'login.html';
    });
    document.body.appendChild(a);
  });
})();
