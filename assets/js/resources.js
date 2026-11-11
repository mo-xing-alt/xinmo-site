/* ============================================================
 * xinmo.work · 资源清单
 * ------------------------------------------------------------
 * 新增资源：把页面放进 resources/ 或 tools/ 下的独立文件夹，
 * 然后在下面的 items 数组里复制一条、改成新资源的信息即可。
 * 首页会自动生成卡片、分类和搜索索引，不用改 HTML。
 *
 * 字段说明：
 *   id          唯一标识
 *   title       卡片标题
 *   subtitle    标题下的一句话副标题
 *   description 卡片正文简介
 *   category    分类 id，对应下面的 categories
 *   icon        图标名：quiz / tool / doc / link / code
 *   accent      配色：indigo / teal / violet / amber
 *   url         资源入口（相对站点根目录）
 *   tags        标签数组，可参与搜索
 *   meta        卡片底部的小字说明
 *   status      右上角状态
 *   updated     最近更新日期 YYYY-MM-DD
 *   soon        true 时渲染为「筹备中」占位卡，不需要 url
 * ============================================================ */
window.RESOURCE_CATALOG = {
  updated: "2026-11-11",
  categories: [
    { id: "tool", label: "实用工具" }
  ],
  items: [
    {
      id: "piano-jianpu",
      title: "钢琴简谱库",
      subtitle: "1000 首 · 双手简谱 · 可试听",
      description: "按社区收录热度精选的 1000 首公有领域传统曲调，每首都带完整可弹奏的双手简谱：右手主旋律、和弦标记与左手伴奏，支持检索筛选、Web Audio 试听、移调、打印导出与本地收藏。另附整库「分析数据」——调性、拍号、曲式、难度、音域分布与热度榜。",
      category: "tool",
      icon: "tool",
      accent: "indigo",
      url: "./tools/piano-jianpu/index.html",
      tags: ["1000 首", "双手简谱", "试听", "移调", "分析数据", "打印导出"],
      meta: "纯前端 · 公有领域曲目 · 附来源署名",
      status: "可用",
      updated: "2026-11-11"
    }
  ]
};
