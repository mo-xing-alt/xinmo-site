/* 轻画布 · 原创模板数据
 * 说明：本文件中的所有模板均为纯色块、几何图形与自撰文案构成，
 * 不包含任何第三方平台的素材、图片、字体文件或模板副本。
 */
window.TEMPLATE_PRESETS = [
  {
    id: 'blank',
    name: '空白画布',
    group: '基础',
    width: 1080,
    height: 1080,
    thumb: '#ffffff',
    background: { type: 'solid', color: '#FFFFFF', color2: '#EEF2FF', angle: 135 },
    elements: []
  },
  {
    id: 'minimal-poster',
    name: '极简白 · 海报',
    group: '海报',
    width: 1080,
    height: 1350,
    thumb: '#F7F7F4',
    background: { type: 'solid', color: '#F7F7F4', color2: '#FFFFFF', angle: 135 },
    elements: [
      { type: 'rect', x: 90, y: 96, w: 150, h: 8, fill: '#4F6BED', radius: 4, name: '顶部色条' },
      { type: 'text', x: 90, y: 220, w: 900, h: 300, text: '让想法\n看得见', fontSize: 118, fontWeight: 700, color: '#1F2333', align: 'left', lineHeight: 1.12, name: '主标题' },
      { type: 'text', x: 90, y: 560, w: 820, h: 140, text: '一份关于设计与表达的轻量提案', fontSize: 38, color: '#6B7189', align: 'left', name: '副标题' },
      { type: 'ellipse', x: 90, y: 930, w: 190, h: 190, fill: '#FFD8A8', name: '圆形装饰' },
      { type: 'ellipse', x: 248, y: 992, w: 128, h: 128, fill: '#B2F2BB', name: '圆形装饰 2' },
      { type: 'rect', x: 90, y: 1180, w: 900, h: 2, fill: '#D9DCE6', name: '分隔线' },
      { type: 'text', x: 90, y: 1210, w: 900, h: 60, text: '2026 · STUDIO NOTES', fontSize: 28, color: '#8A90A6', letterSpacing: 6, name: '页脚' }
    ]
  },
  {
    id: 'gradient-social',
    name: '渐变 · 社媒方图',
    group: '社媒',
    width: 1080,
    height: 1080,
    thumb: 'linear-gradient(135deg,#6D5DF6,#C86DD7)',
    background: { type: 'gradient', color: '#6D5DF6', color2: '#C86DD7', angle: 135 },
    elements: [
      { type: 'ellipse', x: 690, y: -90, w: 480, h: 480, fill: '#FFFFFF', opacity: 0.12, name: '光晕' },
      { type: 'ellipse', x: -140, y: 760, w: 420, h: 420, fill: '#FFFFFF', opacity: 0.10, name: '光晕 2' },
      { type: 'text', x: 100, y: 330, w: 880, h: 90, text: 'DESIGN / NOTES', fontSize: 30, color: '#FFFFFF', letterSpacing: 8, align: 'left', name: '眉标' },
      { type: 'text', x: 100, y: 450, w: 880, h: 280, text: '把复杂\n留给自己', fontSize: 104, fontWeight: 700, color: '#FFFFFF', align: 'left', lineHeight: 1.18, name: '主标题' },
      { type: 'rect', x: 100, y: 800, w: 160, h: 6, fill: '#FFFFFF', radius: 3, name: '短线条' },
      { type: 'text', x: 100, y: 850, w: 880, h: 80, text: '简单，是一种需要练习的能力。', fontSize: 34, color: '#F3EBFF', align: 'left', name: '说明' }
    ]
  },
  {
    id: 'event-notice',
    name: '活动通知 · 竖版',
    group: '海报',
    width: 1080,
    height: 1440,
    thumb: '#FFF4E6',
    background: { type: 'solid', color: '#FFF4E6', color2: '#FFE8CC', angle: 135 },
    elements: [
      { type: 'rect', x: 0, y: 0, w: 1080, h: 300, fill: '#1F2333', name: '顶部色块' },
      { type: 'text', x: 90, y: 90, w: 900, h: 130, text: '分享会', fontSize: 92, fontWeight: 700, color: '#FFFFFF', align: 'left', name: '栏目标题' },
      { type: 'text', x: 90, y: 380, w: 900, h: 100, text: '11 / 28    周六  19:30', fontSize: 44, fontWeight: 600, color: '#C2410C', align: 'left', letterSpacing: 2, name: '时间' },
      { type: 'text', x: 90, y: 520, w: 900, h: 260, text: '从一张白纸\n到一份作品', fontSize: 88, fontWeight: 700, color: '#1F2333', align: 'left', lineHeight: 1.2, name: '主题' },
      { type: 'rect', x: 90, y: 840, w: 900, h: 3, fill: '#E7C9A9', name: '分隔线' },
      { type: 'text', x: 90, y: 890, w: 900, h: 180, text: '聊聊日常创作里的取舍、节奏，以及那些\n看起来不起眼但真正决定成品的小细节。', fontSize: 36, color: '#6B5B4B', align: 'left', lineHeight: 1.6, name: '简介' },
      { type: 'rect', x: 90, y: 1180, w: 360, h: 96, fill: '#C2410C', radius: 48, name: '按钮底' },
      { type: 'text', x: 90, y: 1180, w: 360, h: 96, text: '免费报名', fontSize: 38, fontWeight: 600, color: '#FFFFFF', align: 'center', name: '按钮文字' }
    ]
  },
  {
    id: 'quote-card',
    name: '引语卡片',
    group: '社媒',
    width: 1080,
    height: 1080,
    thumb: '#EEF2FF',
    background: { type: 'solid', color: '#EEF2FF', color2: '#FFFFFF', angle: 135 },
    elements: [
      { type: 'rect', x: 70, y: 70, w: 940, h: 940, fill: '#FFFFFF', radius: 36, name: '卡片底' },
      { type: 'text', x: 140, y: 160, w: 200, h: 160, text: '“', fontSize: 200, fontWeight: 700, color: '#4F6BED', align: 'left', name: '引号' },
      { type: 'text', x: 140, y: 360, w: 800, h: 340, text: '好的设计不是\n加进去更多，\n而是去掉不必要的。', fontSize: 62, fontWeight: 600, color: '#1F2333', align: 'left', lineHeight: 1.5, name: '引文' },
      { type: 'rect', x: 140, y: 760, w: 90, h: 5, fill: '#4F6BED', radius: 3, name: '短线条' },
      { type: 'text', x: 140, y: 800, w: 800, h: 80, text: '— 设计手记', fontSize: 32, color: '#7B8199', align: 'left', name: '署名' }
    ]
  },
  {
    id: 'deck-cover',
    name: '演示封面 · 16:9',
    group: '演示',
    width: 1920,
    height: 1080,
    thumb: '#141A2E',
    background: { type: 'gradient', color: '#141A2E', color2: '#2C3A6B', angle: 135 },
    elements: [
      { type: 'ellipse', x: 1380, y: -220, w: 760, h: 760, fill: '#4F6BED', opacity: 0.28, name: '右侧光晕' },
      { type: 'star', x: 1480, y: 700, w: 220, h: 220, fill: '#FFD166', opacity: 0.9, name: '星形装饰' },
      { type: 'text', x: 160, y: 260, w: 1200, h: 100, text: 'QUARTERLY REVIEW', fontSize: 34, color: '#9FB0E8', letterSpacing: 10, align: 'left', name: '眉标' },
      { type: 'text', x: 160, y: 400, w: 1400, h: 260, text: '把事情讲清楚', fontSize: 128, fontWeight: 700, color: '#FFFFFF', align: 'left', name: '主标题' },
      { type: 'text', x: 160, y: 700, w: 1200, h: 100, text: '2026 · 第四季度工作回顾', fontSize: 40, color: '#C7D2F5', align: 'left', name: '副标题' },
      { type: 'rect', x: 160, y: 880, w: 200, h: 5, fill: '#FFD166', radius: 3, name: '底部线条' }
    ]
  },
  {
    id: 'name-card',
    name: '名片 · 横版',
    group: '物料',
    width: 1200,
    height: 700,
    thumb: '#FFFFFF',
    background: { type: 'solid', color: '#FFFFFF', color2: '#EEF2FF', angle: 135 },
    elements: [
      { type: 'rect', x: 0, y: 0, w: 28, h: 700, fill: '#4F6BED', name: '左侧色条' },
      { type: 'rect', x: 760, y: 0, w: 440, h: 700, fill: '#F3F5FF', name: '右侧色块' },
      { type: 'ellipse', x: 880, y: 210, w: 200, h: 200, fill: '#C7D2F5', name: '圆形装饰' },
      { type: 'text', x: 100, y: 210, w: 620, h: 120, text: '林 见', fontSize: 84, fontWeight: 700, color: '#1F2333', align: 'left', name: '姓名' },
      { type: 'text', x: 100, y: 350, w: 620, h: 70, text: '独立设计师 / Visual Designer', fontSize: 32, color: '#6B7189', align: 'left', name: '职位' },
      { type: 'rect', x: 100, y: 470, w: 540, h: 2, fill: '#DDE1EE', name: '分隔线' },
      { type: 'text', x: 100, y: 510, w: 620, h: 120, text: 'hello@example.com\n+86 138 0000 0000', fontSize: 28, color: '#4B5169', align: 'left', lineHeight: 1.7, name: '联系方式' },
      { type: 'text', x: 820, y: 500, w: 320, h: 80, text: 'STUDIO / 2026', fontSize: 26, color: '#7B8199', align: 'center', letterSpacing: 4, name: '右侧署名' }
    ]
  },
  {
    id: 'promo-banner',
    name: '促销横幅',
    group: '物料',
    width: 1600,
    height: 600,
    thumb: '#FFF0F3',
    background: { type: 'gradient', color: '#FFF0F3', color2: '#FFE0E9', angle: 0 },
    elements: [
      { type: 'ellipse', x: 1180, y: -120, w: 560, h: 560, fill: '#FF9EB5', opacity: 0.45, name: '右侧圆形' },
      { type: 'text', x: 100, y: 120, w: 900, h: 80, text: 'SEASON SPECIAL', fontSize: 32, color: '#B83262', letterSpacing: 8, align: 'left', name: '眉标' },
      { type: 'text', x: 100, y: 220, w: 1000, h: 180, text: '换季好物 8 折起', fontSize: 92, fontWeight: 700, color: '#8E1F47', align: 'left', name: '主标题' },
      { type: 'text', x: 100, y: 420, w: 900, h: 80, text: '活动时间 11.11 — 11.20  ·  全场满减可叠加', fontSize: 30, color: '#A05070', align: 'left', name: '说明' },
      { type: 'rect', x: 1300, y: 240, w: 220, h: 220, fill: '#B83262', radius: 110, name: '徽章底' },
      { type: 'text', x: 1300, y: 300, w: 220, h: 100, text: '20%\nOFF', fontSize: 44, fontWeight: 700, color: '#FFFFFF', align: 'center', lineHeight: 1.2, name: '徽章文字' }
    ]
  },
  {
    id: 'profile-card',
    name: '个人简介卡',
    group: '社媒',
    width: 1080,
    height: 1350,
    thumb: '#E9F7F3',
    background: { type: 'solid', color: '#E9F7F3', color2: '#FFFFFF', angle: 135 },
    elements: [
      { type: 'rect', x: 80, y: 80, w: 920, h: 1190, fill: '#FFFFFF', radius: 32, name: '卡片底' },
      { type: 'ellipse', x: 140, y: 160, w: 180, h: 180, fill: '#8CE0C0', name: '头像占位' },
      { type: 'text', x: 360, y: 200, w: 580, h: 100, text: '关于我', fontSize: 64, fontWeight: 700, color: '#1F2333', align: 'left', name: '标题' },
      { type: 'text', x: 360, y: 300, w: 580, h: 60, text: '设计 / 写作 / 慢跑', fontSize: 30, color: '#5D8F7E', align: 'left', name: '标签' },
      { type: 'rect', x: 140, y: 420, w: 800, h: 2, fill: '#DDEDE7', name: '分隔线' },
      { type: 'text', x: 140, y: 480, w: 800, h: 420, text: '喜欢把复杂的东西拆成\n可以一步步完成的小事。\n\n平时记录工具、流程和一些\n不太起眼但好用的方法。', fontSize: 40, color: '#3E4C48', align: 'left', lineHeight: 1.7, name: '正文' },
      { type: 'rect', x: 140, y: 1010, w: 240, h: 76, fill: '#2F9E78', radius: 38, name: '标签底' },
      { type: 'text', x: 140, y: 1010, w: 240, h: 76, text: '保持好奇', fontSize: 32, fontWeight: 600, color: '#FFFFFF', align: 'center', name: '标签文字' }
    ]
  }
];

window.CANVAS_PRESETS = [
  { id: 'square', name: '社媒方图 1080×1080', width: 1080, height: 1080 },
  { id: 'portrait', name: '竖版海报 1080×1350', width: 1080, height: 1350 },
  { id: 'story', name: '竖屏故事 1080×1920', width: 1080, height: 1920 },
  { id: 'deck', name: '演示 16:9 1920×1080', width: 1920, height: 1080 },
  { id: 'banner', name: '横幅 1600×600', width: 1600, height: 600 },
  { id: 'a4', name: 'A4 比例 1240×1754', width: 1240, height: 1754 }
];
