/**
 * ============================================================
 *  核心调度器（Core / Dispatcher）
 * ============================================================
 * 只做四件事：
 *   1. 从注册表读取插件，动态生成导航与首页卡片；
 *   2. 按 URL hash 把用户路由到某个插件；
 *   3. 调用插件的 createUI() 拿到表单、collect() 收集输入、run() 执行；
 *   4. 统一负责进度、错误、结果渲染与下载入口。
 *
 * 这里没有任何「改后缀 / 压图片」的字样 —— 新增插件不需要改本文件。
 */
import { getPlugins, getPlugin } from './registry.js';
import { CATEGORY_LABELS } from './contract.js';
import {
  el, toast, banner, createProgress, renderResults, clearResults,
} from './ui.js';
import { friendlyError } from './utils.js';

let navEl = null;
let contentEl = null;
let lastResultsEl = null;

/** 挂载整个应用。由 src/main.js 在插件加载完成后调用。 */
export function mount(app) {
  app.textContent = '';

  const header = el('header', { class: 'site-header' },
    el('div', { class: 'header-inner' },
      el('div', { class: 'brand' },
        el('div', { class: 'brand-mark', text: 'FT' }),
        el('div', { class: 'brand-text' },
          el('h1', { text: '本地文件工具箱' }),
          el('p', { text: '无需登录、无需上传，打开网页即可处理文件' }),
        ),
      ),
      el('div', { class: 'privacy-badge' },
        el('span', { class: 'privacy-dot' }),
        el('span', { text: '文件全部在本地浏览器处理，不会上传服务器' }),
      ),
    ),
  );

  navEl = el('nav', { class: 'nav', 'aria-label': '工具导航' });
  contentEl = el('main', { class: 'content' });
  const footer = el('footer', { class: 'site-footer' },
    el('span', { text: '插件化架构 · 新增工具只需增加一个插件模块' }),
    el('span', { text: '纯前端 · 零第三方运行时依赖' }),
  );

  app.append(header, navEl, contentEl, footer);

  window.addEventListener('hashchange', renderRoute);
  if (!location.hash) history.replaceState(null, '', '#/');
  renderRoute();
}

/** 导航完全由注册表驱动，插件一注册就自动出现 */
function renderNav() {
  navEl.textContent = '';
  const current = location.hash || '#/';
  const inner = el('div', { class: 'nav-inner' });

  inner.append(el('a', {
    href: '#/', class: `nav-item${current === '#/' ? ' is-active' : ''}`, text: '首页',
  }));
  for (const plugin of getPlugins()) {
    inner.append(el('a', {
      href: `#/p/${encodeURIComponent(plugin.id)}`,
      class: `nav-item${current === `#/p/${encodeURIComponent(plugin.id)}` ? ' is-active' : ''}`,
      text: plugin.name,
    }));
  }
  inner.append(el('span', { class: 'nav-count', text: `已注册 ${getPlugins().length} 个工具` }));
  navEl.append(inner);
}

function renderRoute() {
  // 离开上一个页面前释放预览 URL
  if (lastResultsEl) { clearResults(lastResultsEl); lastResultsEl = null; }

  renderNav();
  const hash = location.hash || '#/';
  const match = hash.match(/^#\/p\/(.+)$/);
  if (match) renderPluginPage(decodeURIComponent(match[1]));
  else renderHome();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function renderHome() {
  contentEl.textContent = '';
  const plugins = getPlugins();

  const hero = el('section', { class: 'home-hero' },
    el('div', { class: 'hero-eyebrow', text: 'LOCAL · PRIVATE · PLUGGABLE' }),
    el('h2', { text: '常用文件处理，一个页面搞定' }),
    el('p', {
      text: '从修改文件后缀到压缩图片体积，所有运算都在你的浏览器里完成。选择文件 → 调整参数 → 下载结果，三步结束。',
    }),
    el('div', { class: 'hero-stats' },
      el('span', { text: `${plugins.length} 个已注册工具` }),
      el('span', { text: '0 次网络上传' }),
      el('span', { text: '0 个第三方运行时依赖' }),
    ),
  );

  const grid = el('div', { class: 'tool-grid' });
  for (const plugin of plugins) {
    grid.append(el('a', {
      class: 'tool-card', href: `#/p/${encodeURIComponent(plugin.id)}`,
    },
      el('div', { class: 'tool-card-top' },
        el('span', { class: 'tool-badge', text: plugin.badge || 'TOOL' }),
        el('span', { class: 'tool-cat', text: CATEGORY_LABELS[plugin.category] || '工具' }),
      ),
      el('h3', { text: plugin.name }),
      el('p', { text: plugin.description }),
      el('div', { class: 'tool-card-foot', text: '打开工具  →' }),
    ));
  }

  contentEl.append(hero,
    el('div', { class: 'section-head' },
      el('h3', { text: '全部工具' }),
      el('span', { text: '以下列表由插件注册表自动生成' }),
    ),
    grid,
    banner('提示：单纯修改文件后缀并不会转换文件格式；图片压缩会在本地重新编码图像。', 'info'),
  );
}

function renderPluginPage(pluginId) {
  const plugin = getPlugin(pluginId);
  contentEl.textContent = '';

  if (!plugin) {
    contentEl.append(
      banner(`没有找到 id 为「${pluginId}」的工具，它可能已被移除。`, 'error'),
      el('a', { class: 'btn btn-ghost', href: '#/', text: '返回首页' }),
    );
    return;
  }

  const crumb = el('div', { class: 'crumb' },
    el('a', { href: '#/', text: '首页' }),
    el('span', { text: '/' }),
    el('span', { text: plugin.name }),
  );

  const head = el('section', { class: 'tool-head' },
    el('div', { class: 'tool-badge tool-badge-lg', text: plugin.badge || 'TOOL' }),
    el('div', {},
      el('h2', { text: plugin.name }),
      el('p', { text: plugin.description }),
    ),
  );

  let ui;
  try {
    ui = plugin.createUI({ notify: toast });
  } catch (err) {
    contentEl.append(crumb, head, banner(`工具界面初始化失败：${friendlyError(err)}`, 'error'));
    return;
  }

  const progress = createProgress();
  const errorBox = el('div', { class: 'error-slot' });
  const resultsEl = el('div', { class: 'results-slot' });
  lastResultsEl = resultsEl;

  const runBtn = el('button', {
    type: 'button', class: 'btn btn-primary btn-lg', text: '开始处理',
  });

  function showError(message) {
    errorBox.textContent = '';
    errorBox.append(banner(message, 'error'));
    toast(message, 'error');
  }

  async function run() {
    clearResults(resultsEl);
    errorBox.textContent = '';

    let input;
    try {
      input = ui.collect();
    } catch (err) {
      showError(err?.message || String(err));
      return;
    }
    const files = Array.isArray(input?.files) ? input.files : [];
    if (files.length === 0) {
      showError('请先选择至少一个文件。');
      return;
    }

    runBtn.disabled = true;
    runBtn.textContent = '处理中…';
    progress.show();
    progress.update(0, files.length, '准备中');
    try {
      const output = await plugin.run({
        files,
        params: input.params || {},
        onProgress: (done, total, label) => progress.update(done, total, label),
      });
      renderResults(resultsEl, output, { zipName: plugin.id });
      toast('处理完成', 'info');
    } catch (err) {
      showError(`处理失败：${friendlyError(err)}`);
    } finally {
      runBtn.disabled = false;
      runBtn.textContent = '开始处理';
      progress.hide();
    }
  }
  runBtn.addEventListener('click', run);

  const panel = el('section', { class: 'tool-panel' },
    el('div', { class: 'panel-head' },
      el('h3', { text: '1 · 选择文件与设置' }),
      el('span', { text: '支持拖拽上传，可批量处理' }),
    ),
    ui.element,
  );

  contentEl.append(crumb, head);
  if (plugin.notice) contentEl.append(banner(plugin.notice, 'warn'));
  contentEl.append(panel,
    el('div', { class: 'tool-actions' }, runBtn, progress.element),
    errorBox,
    el('div', { class: 'section-head' }, el('h3', { text: '2 · 处理结果' })),
    resultsEl,
  );
}
