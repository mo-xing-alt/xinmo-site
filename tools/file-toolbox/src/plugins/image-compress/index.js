/**
 * 插件二：压缩图片体积（Image Compression）
 *
 * 全链路在浏览器本地完成：
 *   File → createImageBitmap → Web Worker(OffscreenCanvas) → Blob → 预览/下载
 * 不产生任何网络请求。Worker 不可用时自动回退到主线程 <canvas>。
 */
import { registerPlugin } from '../../core/registry.js';
import { el, field, banner, createDropZone } from '../../core/ui.js';
import {
  getExtension, replaceExtension, mimeFromExt, extFromMime,
  friendlyError, formatBytes,
} from '../../core/utils.js';

const FORMAT_MIME = { webp: 'image/webp', jpg: 'image/jpeg', png: 'image/png' };
const ENCODABLE = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_INPUT_BYTES = 80 * 1024 * 1024; // 单文件 80 MB 保护线，避免浏览器内存溢出
const ACCEPT = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  '.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp',
];

/* ---------------------- Worker 池与主线程回退 ---------------------- */
let worker = null;
let workerBroken = false;
let messageSeq = 0;

function getWorker() {
  if (workerBroken) return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./compressor.worker.js', import.meta.url), { type: 'module' });
    worker.addEventListener('error', () => { workerBroken = true; worker = null; });
    return worker;
  } catch {
    workerBroken = true;
    return null;
  }
}

function callWorker(instance, bitmap, payload) {
  return new Promise((resolve, reject) => {
    const id = ++messageSeq;
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('图片处理超时，请尝试更小的图片'));
    }, 30_000);

    function cleanup() {
      clearTimeout(timer);
      instance.removeEventListener('message', onMessage);
      instance.removeEventListener('error', onError);
    }
    function onMessage(event) {
      if (event.data?.id !== id) return;
      cleanup();
      if (event.data.ok) resolve(event.data);
      else reject(new Error(event.data.error || 'Worker 处理失败'));
    }
    function onError(event) {
      cleanup();
      workerBroken = true;
      worker = null;
      reject(new Error(event.message || 'Worker 运行异常'));
    }

    instance.addEventListener('message', onMessage);
    instance.addEventListener('error', onError);
    try {
      instance.postMessage({ id, bitmap, ...payload });
    } catch (err) {
      cleanup();
      reject(err);
    }
  });
}

/** 主线程兜底：普通 <canvas>，逻辑与 Worker 保持一致 */
async function encodeOnMainThread(bitmap, { mime, quality, maxEdge }) {
  let width = bitmap.width;
  let height = bitmap.height;
  if (maxEdge > 0 && Math.max(width, height) > maxEdge) {
    const scale = maxEdge / Math.max(width, height);
    width = Math.max(1, Math.round(width * scale));
    height = Math.max(1, Math.round(height * scale));
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('浏览器不支持 Canvas 2D');
  if (mime === 'image/jpeg') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error('浏览器无法导出该图片格式'))),
      mime,
      quality,
    );
  });
  return { blob, width, height };
}

async function compressOne(file, { mime, quality, maxEdge }) {
  const bitmaps = [];
  try {
    bitmaps.push(await createImageBitmap(file));
    let bitmap = bitmaps[0];

    const instance = getWorker();
    if (instance) {
      try {
        return await callWorker(instance, bitmap, { mime, quality, maxEdge });
      } catch {
        // Worker 不可用：重新解码一次，回退到主线程
        workerBroken = true;
        worker = null;
        const fresh = await createImageBitmap(file);
        bitmaps.push(fresh);
        bitmap = fresh;
      }
    }
    return await encodeOnMainThread(bitmap, { mime, quality, maxEdge });
  } finally {
    for (const b of bitmaps) { try { b.close?.(); } catch { /* 忽略 */ } }
  }
}

/** 决定输出 MIME；顺带返回需要如实告知用户的限制 */
function decideMime(file, target) {
  if (target !== 'keep') return { mime: FORMAT_MIME[target], limitation: null };
  const fromExt = mimeFromExt(getExtension(file.name));
  const mime = fromExt || (file.type?.startsWith('image/') ? file.type : null);
  if (mime && ENCODABLE.includes(mime)) return { mime, limitation: null };
  // 浏览器基本只能编码 jpeg/png/webp，GIF 动画、BMP 等无法原样重新编码
  return {
    mime: 'image/png',
    limitation: 'GIF / BMP 等格式在「保持原格式」下会转为 PNG，且 GIF 动画只保留首帧',
  };
}

/* ------------------------------ 插件定义 ------------------------------ */
const plugin = {
  id: 'image-compress',
  name: '压缩图片体积',
  description: '调节质量、格式与尺寸，浏览器本地重新编码，实时对比压缩前后大小与预览。',
  category: 'image',
  badge: 'IMG',
  accept: ACCEPT,
  notice: '限制说明：GIF 动画只会处理第一帧（动画会丢失）；PNG 为无损格式，质量滑块对它基本无效，想明显减小体积建议转 WebP 或 JPG；WebP 编码能力取决于浏览器版本。',
  defaults: { quality: 80, target: 'keep', maxEdge: 0 },

  createUI() {
    let files = [];

    const drop = createDropZone({
      accept: ACCEPT,
      hint: '支持 JPG / PNG / WebP / GIF，可一次拖入多张图片',
      onChange: (selected) => { files = selected; },
    });

    const quality = el('input', {
      type: 'range', min: '10', max: '100', step: '1', value: String(plugin.defaults.quality),
      id: 'quality-range',
    });
    const qualityValue = el('span', { class: 'range-value', text: `${plugin.defaults.quality}%` });
    quality.addEventListener('input', () => { qualityValue.textContent = `${quality.value}%`; });

    const target = el('select', { id: 'target-format' },
      el('option', { value: 'keep', text: '保持原格式' }),
      el('option', { value: 'webp', text: '转为 WebP（通常最小）' }),
      el('option', { value: 'jpg', text: '转为 JPG（照片推荐）' }),
      el('option', { value: 'png', text: '转为 PNG（无损）' }),
    );

    const maxEdge = el('input', {
      type: 'number', min: '0', max: '20000', step: '1',
      value: String(plugin.defaults.maxEdge), id: 'max-edge', placeholder: '0',
    });

    const element = el('div', {},
      drop.element,
      el('div', { class: 'field-row' },
        el('div', { class: 'field' },
          el('span', { class: 'field-label', text: '输出质量' }),
          el('div', { class: 'range-row' }, quality, qualityValue),
          el('span', { class: 'field-hint', text: '10%–100%。对 JPG / WebP 有效；PNG 为无损格式，此项不生效。' }),
        ),
        field('目标格式', target, '转格式会真正重新编码文件内容，与「只改后缀」不同'),
      ),
      el('div', { class: 'field-row' },
        field('最长边上限（像素，0 = 不限制）', maxEdge, '按最长边等比缩放，例如填 1920 表示宽高中较大者不超过 1920px'),
      ),
      banner('处理全程在浏览器内完成，图片不会上传到任何服务器；结果只在当前页面内存中，刷新即消失。', 'info'),
    );

    return {
      element,
      collect() {
        if (!files.length) throw new Error('请先选择至少一张图片。');
        const edge = Number(maxEdge.value);
        if (!Number.isFinite(edge) || edge < 0 || edge > 20000) {
          throw new Error('最长边上限请填 0–20000 之间的数字，0 表示不限制。');
        }
        return {
          files,
          params: {
            quality: Number(quality.value) / 100,
            target: target.value,
            maxEdge: Math.round(edge),
          },
        };
      },
    };
  },

  async run({ files, params, onProgress }) {
    const results = [];
    const warnings = new Set();
    let becameLarger = 0;

    for (let i = 0; i < files.length; i += 1) {
      const file = files[i];
      onProgress(i, files.length, file.name);
      try {
        if (file.size > MAX_INPUT_BYTES) {
          throw new Error(`文件超过 ${formatBytes(MAX_INPUT_BYTES)}，为避免浏览器内存溢出已跳过。请先缩小尺寸或分批处理。`);
        }
        const { mime, limitation } = decideMime(file, params.target);
        if (limitation) warnings.add(limitation);
        if (getExtension(file.name) === 'gif') {
          warnings.add('GIF 只处理第一帧，输出为静态图片，动画信息会丢失。');
        }

        const { blob, width, height } = await compressOne(file, {
          mime, quality: params.quality, maxEdge: params.maxEdge,
        });

        // 浏览器不支持请求的编码格式时会静默回退（常见：旧版 Safari 的 WebP）
        const actualMime = blob.type || mime;
        if (actualMime !== mime) {
          warnings.add(`当前浏览器不支持编码 ${mime}，已自动回退为 ${actualMime}，输出后缀也相应调整。`);
        }
        const outName = replaceExtension(file.name, extFromMime(actualMime));
        if (blob.size > file.size) becameLarger += 1;

        results.push({
          name: outName,
          blob,
          sourceSize: file.size,
          outputSize: blob.size,
          beforeUrl: URL.createObjectURL(file),
          afterUrl: URL.createObjectURL(blob),
          note: `${width} × ${height} px · 实际输出格式 ${actualMime} · 质量参数 ${Math.round(params.quality * 100)}%`,
        });
      } catch (err) {
        results.push({ name: file.name, sourceSize: file.size, error: friendlyError(err) });
      }
      onProgress(i + 1, files.length, file.name);
    }

    if (becameLarger > 0) {
      warnings.add(`有 ${becameLarger} 张图片处理后反而变大（常见于原本已高度压缩的图片或转成 PNG）。可降低质量、转为 WebP，或调小最长边上限。`);
    }
    return { results, warnings: Array.from(warnings), summaryTitle: '图片压缩完成' };
  },
};

registerPlugin(plugin);
export default plugin;
