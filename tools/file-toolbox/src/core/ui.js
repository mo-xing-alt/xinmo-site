/**
 * ============================================================
 *  通用 UI 组件层
 * ============================================================
 * 由核心提供给所有插件复用：DOM 构建、拖放选择、进度、结果展示、
 * ZIP 打包下载、轻提示。插件不重复造轮子，但不依赖任何具体业务。
 */
import {
  formatBytes,
  sizeChangeText,
  downloadBlob,
  matchesAccept,
  friendlyError,
} from './utils.js';
import { FILE_SIZE_WARN } from './contract.js';
import { createZip } from './zip.js';

/**
 * 极简 DOM 构建器。用户输入一律走 textContent，避免文件名造成注入。
 * @param {string} tag
 * @param {Object} attrs
 * @param {...any} children
 */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'html') node.innerHTML = value; // 仅用于本文件内的可信静态片段
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key === 'style' && typeof value === 'object') Object.assign(node.style, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key in node) {
      try { node[key] = value; } catch { node.setAttribute(key, String(value)); }
    } else {
      node.setAttribute(key, String(value));
    }
  }
  const appendChild = (child) => {
    if (child == null || child === false || child === true) return;
    if (Array.isArray(child)) { child.forEach(appendChild); return; }
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  };
  children.forEach(appendChild);
  return node;
}

/* ------------------------------ 轻提示 ------------------------------ */
let toastHost = null;

export function toast(message, type = 'info') {
  if (!toastHost) {
    toastHost = el('div', { class: 'toast-host', role: 'status', 'aria-live': 'polite' });
    document.body.append(toastHost);
  }
  const node = el('div', { class: `toast toast-${type}`, text: String(message) });
  toastHost.append(node);
  setTimeout(() => {
    node.classList.add('is-out');
    setTimeout(() => node.remove(), 260);
  }, 3400);
}

/** 行内提示条（常驻，用于风险与限制说明） */
export function banner(text, type = 'info') {
  const mark = type === 'warn' ? '!' : type === 'error' ? '×' : 'i';
  return el('div', { class: `banner banner-${type}` },
    el('span', { class: 'banner-mark', text: mark }),
    el('span', { text }),
  );
}

/** 表单字段包装 */
export function field(labelText, control, hintText) {
  return el('label', { class: 'field' },
    el('span', { class: 'field-label', text: labelText }),
    control,
    hintText ? el('span', { class: 'field-hint', text: hintText }) : null,
  );
}

/* --------------------------- 文件拖放选择区 --------------------------- */
/**
 * @param {Object} options
 * @param {string[]} [options.accept] 接受类型（MIME / 扩展名）
 * @param {boolean} [options.multiple]
 * @param {string} [options.hint]
 * @param {(files: File[], rejected: string[]) => void} [options.onChange]
 */
export function createDropZone({ accept = [], multiple = true, hint = '', onChange = () => {} } = {}) {
  let files = [];
  let rejected = [];

  const input = el('input', {
    type: 'file',
    class: 'visually-hidden',
    multiple,
    accept: accept.join(','),
  });
  const listBox = el('div', { class: 'dz-filelist' });
  const rejectBox = el('div', { class: 'dz-reject' });
  const selected = el('div', { class: 'dz-selected', hidden: true }, listBox, rejectBox);

  const zone = el('div', {
    class: 'dropzone',
    tabindex: '0',
    role: 'button',
    'aria-label': '选择或拖入文件',
  },
    el('div', { class: 'dz-symbol', text: '+' }),
    el('p', { class: 'dz-title', text: '把文件拖到这里，或点击选择' }),
    el('p', {
      class: 'dz-hint',
      text: hint || (accept.length ? `支持：${accept.join('、')} · 可批量选择` : '支持批量选择'),
    }),
  );

  function render() {
    listBox.textContent = '';
    rejectBox.textContent = '';

    const header = el('div', { class: 'dz-selected-head' },
      el('span', { text: `已选择 ${files.length} 个文件` }),
      el('button', {
        type: 'button', class: 'link-btn', text: '清空', onclick: (e) => {
          e.stopPropagation();
          setFiles([]);
        },
      }),
    );
    listBox.append(header);

    const chips = el('div', { class: 'dz-chips' });
    for (const file of files) {
      chips.append(el('span', { class: 'chip', title: file.name },
        el('span', { class: 'chip-name', text: file.name }),
        el('span', { class: 'chip-size', text: formatBytes(file.size) }),
      ));
    }
    listBox.append(chips);

    if (rejected.length) {
      rejectBox.append(banner(rejected.join('；'), 'warn'));
    }
    selected.hidden = files.length === 0 && rejected.length === 0;
  }

  function setFiles(incoming) {
    files = [];
    rejected = [];
    for (const file of incoming) {
      if (!matchesAccept(file, accept)) {
        rejected.push(`「${file.name}」格式不在支持范围内，已跳过`);
        continue;
      }
      if (file.size > FILE_SIZE_WARN) {
        rejected.push(`「${file.name}」超过 ${formatBytes(FILE_SIZE_WARN)}，浏览器可能处理缓慢或内存不足`);
      }
      files.push(file);
    }
    render();
    onChange(files.slice(), rejected.slice());
  }

  zone.addEventListener('click', () => input.click());
  zone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
  });
  input.addEventListener('change', () => {
    setFiles(Array.from(input.files || []));
    input.value = '';
  });
  for (const type of ['dragenter', 'dragover']) {
    zone.addEventListener(type, (e) => { e.preventDefault(); zone.classList.add('is-over'); });
  }
  for (const type of ['dragleave', 'dragend']) {
    zone.addEventListener(type, (e) => {
      e.preventDefault();
      if (!zone.contains(e.relatedTarget)) zone.classList.remove('is-over');
    });
  }
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('is-over');
    const dropped = Array.from(e.dataTransfer?.files || []);
    setFiles(multiple ? dropped : dropped.slice(0, 1));
  });

  const element = el('div', { class: 'dz-wrap' }, input, zone, selected);
  render();
  return {
    element,
    getFiles: () => files.slice(),
    clear: () => setFiles([]),
  };
}

/* ------------------------------- 进度条 ------------------------------- */
export function createProgress() {
  const fill = el('div', { class: 'progress-fill' });
  const label = el('span', { class: 'progress-label', text: '准备中…' });
  const element = el('div', { class: 'progress', hidden: true },
    el('div', { class: 'progress-track' }, fill),
    label,
  );
  return {
    element,
    update(done, total, text = '') {
      const pct = total > 0 ? Math.round((done / total) * 100) : 0;
      fill.style.width = `${pct}%`;
      label.textContent = `${text || '正在处理'} ${done}/${total}（${pct}%）`;
    },
    show() { element.hidden = false; fill.style.width = '0%'; },
    hide() { element.hidden = true; },
  };
}

/* ----------------------------- 结果展示区 ----------------------------- */
/**
 * 统一渲染所有插件的输出：汇总数据、逐项对比、预览、下载。
 * 插件只要按契约返回 PluginOutput 即可获得完整结果界面。
 *
 * @param {HTMLElement} container
 * @param {import('./contract.js').PluginOutput} output
 * @param {{zipName?: string}} [options]
 */
export function renderResults(container, output, options = {}) {
  // 释放上一轮创建的预览 URL，避免内存泄漏
  for (const url of container._objectUrls || []) URL.revokeObjectURL(url);
  container._objectUrls = [];
  container.textContent = '';

  const results = Array.isArray(output?.results) ? output.results : [];
  const ok = results.filter((r) => !r.error);
  const failed = results.length - ok.length;
  const sourceTotal = ok.reduce((s, r) => s + (Number(r.sourceSize) || 0), 0);
  const outputTotal = ok.reduce((s, r) => s + (Number(r.outputSize ?? r.sourceSize) || 0), 0);
  const downloadable = ok.filter((r) => r.blob);

  const summaryRows = el('div', { class: 'summary-grid' },
    el('div', { class: 'summary-cell' },
      el('span', { class: 'summary-label', text: '处理文件' }),
      el('strong', { text: `${results.length} 个${failed ? ` · ${failed} 个失败` : ''}` }),
    ),
    el('div', { class: 'summary-cell' },
      el('span', { class: 'summary-label', text: '原始总大小' }),
      el('strong', { text: formatBytes(sourceTotal) }),
    ),
    el('div', { class: 'summary-cell' },
      el('span', { class: 'summary-label', text: '输出总大小' }),
      el('strong', { text: formatBytes(outputTotal) }),
    ),
    el('div', { class: 'summary-cell' },
      el('span', { class: 'summary-label', text: '总体变化' }),
      el('strong', {
        class: outputTotal < sourceTotal ? 'good' : outputTotal > sourceTotal ? 'bad' : '',
        text: sizeChangeText(sourceTotal, outputTotal) || '大小未变',
      }),
    ),
  );

  const panel = el('section', { class: 'results' },
    el('div', { class: 'results-head' },
      el('h3', { text: output?.summaryTitle || '处理完成' }),
      el('span', { class: 'results-sub', text: '所有结果均保存在当前浏览器内存中，刷新页面即消失' }),
    ),
    summaryRows,
  );

  if (output?.warnings?.length) {
    for (const w of output.warnings) panel.append(banner(w, 'warn'));
  }

  const cards = el('div', { class: 'result-list' });
  for (const result of results) {
    const card = el('article', { class: `result-card${result.error ? ' is-error' : ''}` });
    card.append(el('div', { class: 'result-title' },
      el('span', { class: 'result-name', text: result.name }),
      el('span', { class: `result-status ${result.error ? 'bad' : 'good'}`, text: result.error ? '失败' : '完成' }),
    ));

    if (result.error) {
      card.append(banner(result.error, 'error'));
      cards.append(card);
      continue;
    }

    const afterSize = Number(result.outputSize ?? result.sourceSize) || 0;
    const change = sizeChangeText(Number(result.sourceSize) || 0, afterSize);
    card.append(el('div', { class: 'result-metrics' },
      el('span', { text: `原始 ${formatBytes(result.sourceSize)}` }),
      el('span', { class: 'arrow', text: '→' }),
      el('span', { text: `输出 ${formatBytes(afterSize)}` }),
      change ? el('span', { class: 'ratio', text: change }) : null,
    ));

    if (result.text) {
      // 纯文本型结果（如哈希摘要）统一提供复制入口，插件无需自己实现
      const copyBtn = el('button', { type: 'button', class: 'link-btn', text: '复制' });
      copyBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(result.text);
          copyBtn.textContent = '已复制';
          setTimeout(() => { copyBtn.textContent = '复制'; }, 1600);
        } catch {
          toast('复制失败，请手动选中文本复制', 'warn');
        }
      });
      card.append(el('div', { class: 'result-code-wrap' },
        el('code', { class: 'result-code', text: result.text }),
        copyBtn,
      ));
    }
    if (result.note) card.append(el('p', { class: 'result-note', text: result.note }));

    if (result.beforeUrl || result.afterUrl) {
      const previews = el('div', { class: 'preview-grid' });
      const add = (url, caption) => {
        if (!url) return;
        container._objectUrls.push(url);
        previews.append(el('figure', { class: 'preview' },
          el('img', { src: url, alt: caption, loading: 'lazy' }),
          el('figcaption', { class: 'figcaption', text: caption }),
        ));
      };
      add(result.beforeUrl, '处理前');
      add(result.afterUrl, '处理后');
      card.append(previews);
    }

    if (result.blob) {
      card.append(el('div', { class: 'result-actions' },
        el('button', {
          type: 'button', class: 'btn btn-ghost', text: '下载此文件',
          onclick: () => downloadBlob(result.blob, result.name),
        }),
      ));
    }
    cards.append(card);
  }
  panel.append(cards);

  if (downloadable.length > 0) {
    const zipBtn = el('button', {
      type: 'button', class: 'btn btn-primary', text: `打包下载全部（ZIP · ${downloadable.length} 个文件）`,
      onclick: async () => {
        zipBtn.disabled = true;
        const original = zipBtn.textContent;
        zipBtn.textContent = '正在打包…';
        try {
          const blob = await createZip(downloadable.map((r) => ({ name: r.name, blob: r.blob })));
          downloadBlob(blob, `${options.zipName || 'toolbox'}-结果.zip`);
          toast('已开始下载 ZIP 压缩包');
        } catch (err) {
          toast(`打包失败：${friendlyError(err)}`, 'error');
        } finally {
          zipBtn.disabled = false;
          zipBtn.textContent = original;
        }
      },
    });
    panel.append(el('div', { class: 'results-foot' }, zipBtn,
      el('span', { class: 'results-sub', text: '也可以在每个结果卡片里逐个下载' }),
    ));
  }

  if (results.length === 0) panel.append(banner('没有产生任何结果，请检查输入文件。', 'warn'));
  container.append(panel);
}

/** 清空结果区并释放预览 URL */
export function clearResults(container) {
  for (const url of container._objectUrls || []) URL.revokeObjectURL(url);
  container._objectUrls = [];
  container.textContent = '';
}
