/* 页面守卫：同步、尽早执行。未登录直接跳登录页，子页面同样受保护。
 * 注意：这是前端拦截，只挡随手访问；静态文件本身仍可从公开 URL 获取。 */
(function () {
  'use strict';
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
    var a = document.createElement('a');
    a.href = '#';
    a.textContent = '退出';
    a.setAttribute('aria-label', '退出登录');
    a.style.cssText = 'position:fixed;right:14px;bottom:14px;z-index:99998;' +
      'font:11px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif;' +
      'color:inherit;opacity:.38;text-decoration:none;padding:5px 9px;border-radius:8px;' +
      'background:rgba(127,127,127,.10);';
    a.addEventListener('mouseenter', function () { a.style.opacity = '.8'; });
    a.addEventListener('mouseleave', function () { a.style.opacity = '.38'; });
    a.addEventListener('click', function (e) {
      e.preventDefault();
      try { localStorage.removeItem(KEY); } catch (err) {}
      location.href = root + 'login.html';
    });
    document.body.appendChild(a);
  });
})();
