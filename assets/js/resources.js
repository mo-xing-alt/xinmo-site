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
  updated: "2026-11-10",
  categories: [
    { id: "study", label: "学习练习" },
    { id: "tool", label: "实用工具" }
  ],
  items: [
    {
      id: "info-security-quiz",
      title: "信息安全题库练习",
      subtitle: "随机答疑 · 404 道精选题",
      description: "覆盖信息安全基础、软件安全、密码学、网络安全等方向的刷题页面。随机抽题、即时判分、自动收错题本，练习进度保存在浏览器本地，键盘 A/B/C/D 或 1-4 就能作答。",
      category: "study",
      icon: "quiz",
      accent: "teal",
      url: "./resources/info-security-quiz/index.html",
      tags: ["404 道题", "错题本", "正确率统计", "键盘作答", "进度本地保存"],
      meta: "单文件页面 · 离线也能用",
      status: "可用",
      updated: "2026-11-10"
    },
    {
      id: "file-toolbox",
      title: "本地文件工具箱",
      subtitle: "改后缀 · 压图片 · 算哈希",
      description: "三个日常文件小工具：批量修改扩展名、调节质量与尺寸压缩图片、计算 SHA 文件摘要，还能一键打包下载。全部在浏览器本地完成，文件不经过任何服务器。",
      category: "tool",
      icon: "tool",
      accent: "indigo",
      url: "./tools/file-toolbox/index.html",
      tags: ["批量改后缀", "图片压缩", "SHA 摘要", "ZIP 打包", "文件不上传"],
      meta: "纯前端 · 插件化可扩展",
      status: "可用",
      updated: "2026-11-10"
    },
    {
      id: "coming-soon",
      soon: true,
      title: "下一个资源正在路上",
      subtitle: "KEEP BUILDING",
      description: "这里会陆续放上新的小工具、笔记和练习页。有想要的东西，直接告诉站主就好。",
      accent: "violet"
    }
  ]
};
