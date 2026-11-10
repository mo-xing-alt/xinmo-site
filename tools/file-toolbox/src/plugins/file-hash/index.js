/**
 * 示范扩展插件：文件哈希摘要（File Hash）
 *
 * 这个插件的意义是「证明扩展机制可用」：
 * 它没有依赖任何核心改动，只是在 manifest.js 里多了一行路径，
 * 就自动出现在导航、首页卡片、路由和统一结果区里。
 *
 * 为什么是 SHA 而不是 brief 举例的 MD5：
 * 浏览器原生 Web Crypto 只提供 SHA-1 / SHA-256 / SHA-384 / SHA-512，
 * 没有 MD5。与其引入第三方库或伪造一个 MD5，不如如实提供原生能力，
 * 并在 README 中说明这一客观限制。
 */
import { registerPlugin } from '../../core/registry.js';
import { el, field, banner, createDropZone } from '../../core/ui.js';
import { friendlyError, formatBytes } from '../../core/utils.js';

const ALGORITHMS = ['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'];
const MAX_INPUT_BYTES = 80 * 1024 * 1024;

async function computeDigest(file, algorithm) {
  if (!globalThis.crypto?.subtle) {
    throw new Error('当前页面不是安全上下文，Web Crypto 不可用。请通过 localhost 或 https 访问本页面。');
  }
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest(algorithm, buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

const plugin = {
  id: 'file-hash',
  name: '文件哈希摘要',
  description: '示范扩展插件：批量计算文件 SHA 摘要，用于校验文件是否被改动。',
  category: 'utility',
  badge: 'SHA',
  accept: [],
  notice: '这是用于验证插件架构的示范工具。浏览器原生只支持 SHA 系列摘要，不提供 MD5；如需 MD5 可另建插件并引入对应实现。',
  defaults: { algorithm: 'SHA-256' },

  createUI() {
    let files = [];
    const drop = createDropZone({
      hint: '任意类型文件，支持批量计算',
      onChange: (selected) => { files = selected; },
    });

    const algorithm = el('select', { id: 'hash-algorithm' },
      ALGORITHMS.map((name) => el('option', {
        value: name,
        text: name === 'SHA-256' ? `${name}（推荐）` : name,
        selected: name === plugin.defaults.algorithm,
      })),
    );

    const element = el('div', {},
      drop.element,
      el('div', { class: 'field-row' },
        field('摘要算法', algorithm, '算法只影响摘要长度与强度，不改变原文件'),
      ),
      banner('摘要在本地计算，文件不会上传；结果只是文本的校验值，本工具不会修改或下载原文件。', 'info'),
    );

    return {
      element,
      collect() {
        if (!files.length) throw new Error('请先选择至少一个文件。');
        return { files, params: { algorithm: algorithm.value } };
      },
    };
  },

  async run({ files, params, onProgress }) {
    const results = [];
    const warnings = [];
    for (let i = 0; i < files.length; i += 1) {
      const file = files[i];
      onProgress(i, files.length, file.name);
      try {
        if (file.size > MAX_INPUT_BYTES) {
          throw new Error(`文件超过 ${formatBytes(MAX_INPUT_BYTES)}，已跳过以避免浏览器内存溢出。`);
        }
        const digest = await computeDigest(file, params.algorithm);
        results.push({
          name: file.name,
          sourceSize: file.size,
          text: digest,
          note: `${params.algorithm} · ${file.size} 字节 · 文件本身未被修改`,
        });
      } catch (err) {
        results.push({ name: file.name, sourceSize: file.size, error: friendlyError(err) });
      }
      onProgress(i + 1, files.length, file.name);
    }
    if (results.some((r) => r.error)) {
      warnings.push('部分文件未能计算摘要，请查看下方红色卡片中的具体原因。');
    }
    return { results, warnings, summaryTitle: '摘要计算完成' };
  },
};

registerPlugin(plugin);
export default plugin;
