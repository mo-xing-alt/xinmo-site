/**
 * ============================================================
 *  插件契约（Plugin Contract）—— 全项目最重要的一份约定
 * ============================================================
 * 核心层（registry / dispatcher / ui）只认识下面这几个字段，
 * 不认识任何具体业务。新增一个工具 = 新增一个插件模块 + 在
 * src/plugins/manifest.js 里加一行路径，核心代码零改动。
 *
 * @typedef {Object} ToolPlugin
 * @property {string} id              唯一标识，与插件目录名一致，例如 "change-extension"
 * @property {string} name            展示名
 * @property {string} description     一句话说明
 * @property {string} [category]      分组：file | image | utility
 * @property {string} [badge]         卡片左上角的短标签（纯文本，如 "EXT"）
 * @property {string[]} [accept]      接受的文件类型（MIME 或扩展名），用于文件选择器与拖入校验
 * @property {string} [notice]        插件页顶部常驻说明（用于标注客观限制，如 GIF 只处理首帧）
 * @property {Object} [defaults]      默认参数，插件自行读取
 * @property {(ctx: PluginUIContext) => PluginUI} createUI  创建插件自包含的参数表单
 * @property {(input: PluginInput) => Promise<PluginOutput>} run  核心执行逻辑
 *
 * @typedef {Object} PluginUIContext
 * @property {(message: string, type?: 'info'|'warn'|'error') => void} notify  顶部轻提示
 *
 * @typedef {Object} PluginUI
 * @property {HTMLElement} element    表单根节点（核心把它挂到工作区）
 * @property {() => {files: File[], params: Object}} collect  收集输入；校验失败请 throw new Error('中文提示')
 *
 * @typedef {Object} PluginInput
 * @property {File[]} files           用户选择的文件
 * @property {Object} params          插件自定义参数
 * @property {(done: number, total: number, label: string) => void} onProgress  进度回调
 *
 * @typedef {Object} PluginResult
 * @property {string} name            输出文件名
 * @property {Blob} [blob]           可下载产物（没有产物的纯文本类工具可不传）
 * @property {number} sourceSize     原始字节数
 * @property {number} [outputSize]   输出字节数，默认等于 sourceSize
 * @property {string} [beforeUrl]    处理前预览图 URL
 * @property {string} [afterUrl]     处理后预览图 URL
 * @property {string} [text]         纯文本结果（如哈希值）
 * @property {string} [note]         单项补充说明
 * @property {string} [error]        单项失败原因；有值时该卡片标红且不提供下载
 *
 * @typedef {Object} PluginOutput
 * @property {PluginResult[]} results  与输入文件一一对应（顺序一致）
 * @property {string[]} [warnings]    整批级别的提示（非阻断）
 * @property {string} [summaryTitle]  汇总条标题，默认「处理完成」
 *
 * 说明：单文件处理失败不要抛错中断整批，请写进 results[].error；
 * 只有「整批都无法进行」时才 throw，核心会给出统一错误提示。
 */

/** 分组展示名 */
export const CATEGORY_LABELS = {
  file: '文件处理',
  image: '图片处理',
  utility: '实用工具',
};

/** 单文件大小上限：超过后在通用拖放区给出友好提示（不是硬性拒绝，由插件决定） */
export const FILE_SIZE_WARN = 100 * 1024 * 1024;
