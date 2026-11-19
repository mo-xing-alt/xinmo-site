/* ============================================================
 * xinmo.work · 证书备考数据
 * ------------------------------------------------------------
 * 这是「证书」板块的唯一数据源。页面自动读它生成卡片，不用改 HTML。
 *
 * 【怎么新增一个证书】
 *   在下面 CERTS 数组里复制一个对象，改 id / name / 等字段即可。
 *   id 用英文小写+连字符，唯一，如 "软考" → "ruan-kao"。
 *
 * 【怎么给某证书加内容】
 *   每个证书有三个数组：questions（题）/ experience（经验）/ materials（资料）。
 *   每条内容是一个对象，字段：
 *     title       标题（必填）
 *     desc        一句话说明（选填）
 *     url         链接（选填；站内用 ./ 开头，站外用 https://）
 *     file        附件文件名（选填，放在 resources/certificates/<证书id>/ 下）
 *   title 必填，url / file 至少给一个（否则显示为"整理中"）。
 *
 * 【三类内容的含义】
 *   questions  题目/题库/真题
 *   experience 备考经验/心得/路线
 *   materials  资料/笔记/文档/课程
 * ============================================================ */
window.CERT_DATA = {
  updated: "2026-11-19",
  intro: "把考证书要用到的题目、经验与资料按证书归好类，点开即用、随时补充。",
  certs: [
    {
      id: "ruan-kao",
      name: "软考",
      full: "计算机技术与软件专业技术资格",
      icon: "💻",
      accent: "indigo",
      desc: "程序员、软件设计师、系统集成等计算机技术与软件专业技术资格考试。",
      tags: ["计算机", "职称", "初级/中级/高级"],
      questions: [
        { title: "综合知识真题合集", desc: "历年选择题与案例题整理（整理中）", url: "" },
      ],
      experience: [
        { title: "备考路线与时间规划", desc: "3 个月通过的复习节奏（整理中）", url: "" },
      ],
      materials: [
        { title: "官方教程与考纲", desc: "待补充链接", url: "" },
      ],
    },
    {
      id: "jiao-zi",
      name: "教师资格证",
      full: "中小学教师资格考试",
      icon: "📚",
      accent: "teal",
      desc: "笔试（综合素质、教育知识与能力）+ 面试，含普通话等级要求。",
      tags: ["教育", "笔试+面试", "普通话"],
      questions: [
        { title: "综合素质历年真题", desc: "整理中", url: "" },
      ],
      experience: [
        { title: "面试试讲准备心得", desc: "整理中", url: "" },
      ],
      materials: [
        { title: "科目二知识点思维导图", desc: "整理中", url: "" },
      ],
    },
    {
      id: "cet",
      name: "英语四六级",
      full: "大学英语四级 / 六级",
      icon: "🔤",
      accent: "violet",
      desc: "听力、阅读、写作与翻译，覆盖四级、六级常见备考材料。",
      tags: ["英语", "四级", "六级"],
      questions: [
        { title: "历年真题与听力原文", desc: "整理中", url: "" },
      ],
      experience: [
        { title: "听力提分方法", desc: "整理中", url: "" },
      ],
      materials: [
        { title: "高频词汇与写作模板", desc: "整理中", url: "" },
      ],
    },
  ],
};
