/**
 * ============================================================
 *  中央注册表（Registry）
 * ============================================================
 * 唯一职责：保存「插件契约的实现」。不含任何业务逻辑、不渲染 UI。
 * 插件模块在被 import 时自行调用 registerPlugin() 完成注册；
 * 调度器只通过 getPlugins() / getPlugin() 读取，两者互不依赖。
 */
const plugins = new Map();

const REQUIRED_FIELDS = ['id', 'name', 'description', 'createUI', 'run'];

/**
 * 注册一个插件。重复 id 直接报错，避免静默覆盖导致的功能丢失。
 * @param {import('./contract.js').ToolPlugin} plugin
 */
export function registerPlugin(plugin) {
  if (!plugin || typeof plugin !== 'object') {
    throw new Error('registerPlugin: 插件必须是一个对象');
  }
  for (const key of REQUIRED_FIELDS) {
    if (!plugin[key]) throw new Error(`registerPlugin: 插件缺少必填字段 "${key}"`);
  }
  if (typeof plugin.run !== 'function' || typeof plugin.createUI !== 'function') {
    throw new Error(`registerPlugin: 插件 "${plugin.id}" 的 run / createUI 必须是函数`);
  }
  if (plugins.has(plugin.id)) {
    throw new Error(`registerPlugin: 插件 id 重复 "${plugin.id}"`);
  }
  plugins.set(plugin.id, {
    category: 'utility',
    badge: 'TOOL',
    accept: [],
    defaults: {},
    ...plugin,
  });
}

/** @returns {import('./contract.js').ToolPlugin[]} 按注册顺序返回全部插件 */
export function getPlugins() {
  return Array.from(plugins.values());
}

/** @returns {import('./contract.js').ToolPlugin | null} */
export function getPlugin(id) {
  return plugins.get(id) || null;
}
