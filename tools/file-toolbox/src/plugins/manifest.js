/**
 * ============================================================
 *  插件装载清单（唯一需要为「新增工具」改动的文件）
 * ============================================================
 * 新增一个工具的步骤：
 *   1. 新建目录 src/plugins/<plugin-id>/index.js，按 src/core/contract.js
 *      的契约实现 createUI() 与 run()，并在文件底部调用 registerPlugin(plugin)；
 *   2. 在下面的 PLUGIN_MODULES 数组里加一行路径。
 *
 * 核心的 registry.js / dispatcher.js / ui.js 完全不需要改动：
 * 导航、首页卡片、路由、进度、结果展示、下载会自动把这个工具带上。
 *
 * 注意：动态 import 的路径是相对于本文件的 URL 解析的。
 */
import { getPlugins } from '../core/registry.js';

const PLUGIN_MODULES = [
  './change-extension/index.js',
  './image-compress/index.js',
  './file-hash/index.js',
];

/** 依次 import 插件模块；模块自身完成注册。返回加载失败信息（不阻断其它插件）。 */
export async function loadPlugins() {
  const errors = [];
  for (const path of PLUGIN_MODULES) {
    try {
      await import(path);
    } catch (err) {
      errors.push(`${path}：${err?.message || err}`);
      // eslint-disable-next-line no-console
      console.error('[工具箱] 插件加载失败', path, err);
    }
  }
  return { errors, count: getPlugins().length };
}
