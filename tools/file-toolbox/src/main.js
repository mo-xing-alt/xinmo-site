/**
 * 应用入口：先装载全部插件（各自注册到中央注册表），再挂载调度器。
 * 顺序不能反 —— 调度器渲染导航时注册表必须已经就绪。
 */
import { loadPlugins } from './plugins/manifest.js';
import { mount } from './core/dispatcher.js';
import { el, toast } from './core/ui.js';

const app = document.getElementById('app');

try {
  const { errors, count } = await loadPlugins();
  mount(app);
  if (errors.length) {
    console.error('[工具箱] 部分插件加载失败：', errors);
    toast(`有 ${errors.length} 个工具加载失败，其余 ${count} 个工具可正常使用`, 'warn');
  }
  if (count === 0) {
    app.textContent = '';
    app.append(el('div', { class: 'boot-fallback', text: '没有加载到任何工具，请检查浏览器控制台中的插件加载错误。' }));
  }
} catch (err) {
  console.error('[工具箱] 启动失败', err);
  app.textContent = '';
  app.append(el('div', {
    class: 'boot-fallback',
    text: `工具箱启动失败：${err?.message || err}。请确认通过 npm run dev 启动的本地服务器访问本页面。`,
  }));
}
