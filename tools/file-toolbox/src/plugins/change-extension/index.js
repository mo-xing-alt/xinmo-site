/**
 * 插件一：修改文件后缀名（Change Extension）
 *
 * 严格遵守 brief：只改「文件名」，不改动任何文件内容字节。
 * new File([原文件], 新名字) 只是给同一个 Blob 换了个展示名，
 * 因此大小、二进制内容、编码、像素完全一致。
 */
import { registerPlugin } from '../../core/registry.js';
import { el, field, banner, createDropZone } from '../../core/ui.js';
import {
  getExtension, replaceExtension, isImageFile, IMAGE_EXTS, friendlyError,
} from '../../core/utils.js';

const COMMON_EXTS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'txt', 'pdf', 'json', 'csv', 'zip', 'mp4', 'bin'];

const plugin = {
  id: 'change-extension',
  name: '修改文件后缀',
  description: '批量修改文件扩展名，只改名字不改内容，支持逐个或打包下载。',
  category: 'file',
  badge: 'EXT',
  accept: [], // 任意类型的文件都可以
  notice: '重要：单纯修改后缀并不会转换文件格式。例如把 .jpg 改成 .png，文件内部仍然是 JPEG 数据，部分程序可能无法正常打开。',
  defaults: { ext: 'png' },

  createUI() {
    let files = [];

    const extInput = el('input', {
      type: 'text',
      id: 'target-ext',
      value: plugin.defaults.ext,
      placeholder: '例如 png',
      autocomplete: 'off',
      spellcheck: false,
    });

    const quickButtons = [];
    const quickRow = el('div', { class: 'inline-options' });
    for (const ext of COMMON_EXTS) {
      const btn = el('button', {
        type: 'button',
        class: `chip-option${ext === plugin.defaults.ext ? ' is-active' : ''}`,
        text: `.${ext}`,
      });
      btn.addEventListener('click', () => {
        extInput.value = ext;
        quickButtons.forEach((b) => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        updateRisk();
      });
      quickButtons.push(btn);
      quickRow.append(btn);
    }

    const riskBox = el('div', { class: 'risk-slot' });
    const drop = createDropZone({
      hint: '可选择任意类型文件，支持一次拖入多个',
      onChange: (selected) => { files = selected; updateRisk(); },
    });

    function updateRisk() {
      riskBox.textContent = '';
      const ext = extInput.value.trim().toLowerCase().replace(/^\.+/, '');
      const imageCount = files.filter(isImageFile).length;
      if (ext && imageCount > 0 && !IMAGE_EXTS.includes(ext)) {
        riskBox.append(banner(
          `检测到 ${imageCount} 个图片文件将被改成 .${ext} 后缀，这不是图片常用格式，文件很可能打不开。你可以继续，但建议确认目标后缀是否正确。`,
          'warn',
        ));
      }
    }
    extInput.addEventListener('input', () => {
      const current = extInput.value.trim().toLowerCase();
      quickButtons.forEach((b) => b.classList.toggle('is-active', b.textContent === `.${current}`));
      updateRisk();
    });

    const element = el('div', {},
      drop.element,
      el('div', { class: 'field-row' },
        field('目标后缀（不含点）', extInput, '仅修改文件名中的扩展名部分，主文件名保持不变'),
      ),
      el('div', { class: 'field' },
        el('span', { class: 'field-label', text: '常用后缀（点击快速填入）' }),
        quickRow,
      ),
      banner('处理前后文件字节完全一致，本工具不会重新编码、不会转换格式，也不会把文件传到任何服务器。', 'info'),
      riskBox,
    );

    return {
      element,
      collect() {
        const ext = extInput.value.trim().replace(/^\.+/, '');
        if (!ext) throw new Error('请填写目标后缀，例如 png。');
        if (!/^[a-z0-9][a-z0-9_-]{0,15}$/i.test(ext)) {
          throw new Error('后缀只能包含字母、数字、下划线或连字符，且长度不超过 16 个字符。');
        }
        if (!files.length) throw new Error('请先选择至少一个文件。');
        return { files, params: { ext } };
      },
    };
  },

  async run({ files, params, onProgress }) {
    const results = [];
    const warnings = [];
    const nameCount = new Map();
    let imageToOther = 0;

    for (let i = 0; i < files.length; i += 1) {
      const file = files[i];
      onProgress(i, files.length, file.name);
      try {
        const oldExt = getExtension(file.name);
        const newName = replaceExtension(file.name, params.ext);
        // 关键点：以原 File 对象作为唯一 Blob 源，字节不做任何改动
        const renamed = new File([file], newName, {
          type: file.type,
          lastModified: file.lastModified,
        });
        if (renamed.size !== file.size) throw new Error('输出大小校验未通过，已跳过该文件');

        if (isImageFile(file) && !IMAGE_EXTS.includes(params.ext.toLowerCase())) imageToOther += 1;
        nameCount.set(newName, (nameCount.get(newName) || 0) + 1);

        results.push({
          name: newName,
          blob: renamed,
          sourceSize: file.size,
          outputSize: renamed.size,
          note: `原后缀 ${oldExt ? `.${oldExt}` : '（无）'} → .${params.ext} · ${file.size} 字节内容原样保留，未重新编码`,
        });
      } catch (err) {
        results.push({ name: file.name, sourceSize: file.size, error: `无法处理：${friendlyError(err)}` });
      }
      onProgress(i + 1, files.length, file.name);
    }

    if (imageToOther > 0) {
      warnings.push(`有 ${imageToOther} 个图片文件被改成了非图片后缀。这不会转换格式，文件可能打不开；如需真正转换格式，请使用图片压缩工具的「转格式」功能。`);
    }
    const duplicates = Array.from(nameCount.entries()).filter(([, count]) => count > 1).map(([name]) => name);
    if (duplicates.length) {
      warnings.push(`输出文件名重复：${duplicates.join('、')}。打包下载时同名文件可能相互覆盖，建议逐个下载或先重命名源文件。`);
    }
    warnings.push('再次提醒：修改后缀 ≠ 格式转换。若程序打不开结果文件，把后缀改回原值即可恢复。');

    return { results, warnings, summaryTitle: '后缀修改完成' };
  },
};

// 模块被 import 时自行注册 —— 核心调度器不知道本插件的存在
registerPlugin(plugin);
export default plugin;
