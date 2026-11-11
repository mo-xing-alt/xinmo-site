/*
 * js/data.js
 * 默认 / 演示数据。所有示例均为「通用占位配置」，不含任何真实第三方站点的
 * 专用适配器、接口地址或破解逻辑；域名统一采用 RFC 2606 保留示例域。
 */
(function (root) {
  'use strict';

  var SR = root.SR || (root.SR = {});
  var isNode = (typeof module !== 'undefined' && !!module.exports);
  var core = isNode ? require('./core.js') : SR.core;

  var NOTE = '通用占位配置，不针对任何真实站点；请在您本人已登录且拥有合法权限的页面上按需修改选择器。';

  var IDS = Object.freeze({
    ADAPTER_COURSE: 'adapter_course_demo',
    ADAPTER_QUOTA: 'adapter_quota_demo',
    ADAPTER_SANDBOX: 'adapter_sandbox_demo',
    TEMPLATE_DEFAULT: 'template_default_demo',
    POLICY_DEFAULT: 'policy_default_demo',
    POLICY_FAST: 'policy_fast_demo',
    TASK_COURSE: 'task_course_demo',
    TASK_QUOTA: 'task_quota_demo'
  });

  var SEED_DATE = '2026-01-01T00:00:00.000Z';

  function isoAfter(seconds) {
    return new Date(Date.now() + (Number(seconds) || 0) * 1000).toISOString();
  }

  /**
   * 3 个通用示例适配器（含 1 个沙箱专用）。
   * captchaSelector 为通用特征串，用于「检测到人机验证即中止」，不是绕过逻辑。
   */
  function defaultAdapters() {
    return [
      {
        id: IDS.ADAPTER_COURSE,
        name: '通用课程选择表单（占位）',
        urlPattern: 'https://course.example.com/*',
        description: NOTE,
        fields: [
          { key: 'courseCode', selector: '#course-code', mode: 'value', label: '课程代码' },
          { key: 'campus', selector: 'select[name="campus"]', mode: 'select', label: '校区' },
          { key: 'agree', selector: '#agree-terms', mode: 'click', label: '同意条款' }
        ],
        submitSelector: 'button[type="submit"]',
        successKeyword: '选课成功',
        captchaSelector: '.captcha, [class*="captcha"], [id*="captcha"], [class*="verify"]',
        createdAt: SEED_DATE
      },
      {
        id: IDS.ADAPTER_QUOTA,
        name: '通用名额预约表单（占位）',
        urlPattern: 'https://booking.example.com/*',
        description: NOTE,
        fields: [
          { key: 'slotDate', selector: 'input[name="slotDate"]', mode: 'value', label: '预约日期' },
          { key: 'personName', selector: '#person-name', mode: 'value', label: '姓名' },
          { key: 'idNumber', selector: '#id-number', mode: 'value', label: '证件号' }
        ],
        submitSelector: 'button#reserve-submit',
        successKeyword: '预约成功',
        captchaSelector: '.captcha, [class*="captcha"], [id*="captcha"], [class*="verify"]',
        createdAt: SEED_DATE
      },
      {
        id: IDS.ADAPTER_SANDBOX,
        name: '演练沙箱专用（占位）',
        urlPattern: '*://sandbox.invalid/*',
        description: NOTE + ' 仅用于本地演练，不对应任何真实页面。',
        fields: [
          { key: 'slotName', selector: '#slot-name', mode: 'value', label: '名额名称' }
        ],
        submitSelector: '#sandbox-submit',
        successKeyword: '抢位成功',
        captchaSelector: '.captcha, [id*="captcha"], [data-challenge]',
        createdAt: SEED_DATE
      }
    ];
  }

  /** 表单模板：含敏感字段（默认遮罩、导出脱敏）。 */
  function defaultTemplates() {
    return [
      {
        id: IDS.TEMPLATE_DEFAULT,
        name: '通用填报模板（占位）',
        variables: [
          { key: 'courseCode', label: '课程代码', value: 'CS-101', sensitive: false },
          { key: 'campus', label: '校区', value: '主校区', sensitive: false },
          { key: 'slotDate', label: '预约日期', value: '2026-12-01', sensitive: false },
          { key: 'personName', label: '姓名', value: '张三', sensitive: false },
          { key: 'idNumber', label: '身份证号', value: '110000199001010000', sensitive: true },
          { key: 'token', label: '访问令牌', value: 'demo-token-please-replace', sensitive: true }
        ],
        mappings: [
          { fieldKey: 'courseCode', templateExpr: '{{courseCode}}' },
          { fieldKey: 'campus', templateExpr: '{{campus}}' },
          { fieldKey: 'agree', templateExpr: 'true' },
          { fieldKey: 'slotDate', templateExpr: '{{slotDate}}' },
          { fieldKey: 'personName', templateExpr: '{{personName}}' },
          { fieldKey: 'idNumber', templateExpr: '{{idNumber}}' }
        ]
      }
    ];
  }

  /** 调度策略：默认模拟提交、强制验证码中止、人工确认开启。 */
  function defaultPolicies() {
    return [
      {
        id: IDS.POLICY_DEFAULT,
        name: '稳健默认（占位）',
        openAt: isoAfter(600),
        warmupSec: 5,
        intervalMs: 3000,
        jitterPct: 10,
        maxAttempts: 20,
        timeoutMs: 10000,
        requireConfirm: true,
        liveSubmit: false,
        stopOnCaptcha: true
      },
      {
        id: IDS.POLICY_FAST,
        name: '演练快速（占位）',
        openAt: isoAfter(60),
        warmupSec: 0,
        intervalMs: 1000,
        jitterPct: 0,
        maxAttempts: 12,
        timeoutMs: 5000,
        requireConfirm: true,
        liveSubmit: false,
        stopOnCaptcha: true
      }
    ];
  }

  /** 示例任务：目标地址均为保留示例域，仅用于演练。 */
  function defaultTasks() {
    return [
      {
        id: IDS.TASK_COURSE,
        name: '示例 · 课程补选演练',
        type: 'course',
        targetUrl: 'https://course.example.com/select',
        adapterId: IDS.ADAPTER_COURSE,
        templateId: IDS.TEMPLATE_DEFAULT,
        policyId: IDS.POLICY_FAST,
        status: 'ready',
        note: '仅用于演练沙箱，不对应任何真实站点。',
        createdAt: SEED_DATE,
        lastRun: null
      },
      {
        id: IDS.TASK_QUOTA,
        name: '示例 · 名额预约演练',
        type: 'quota',
        targetUrl: 'https://booking.example.com/reserve',
        adapterId: IDS.ADAPTER_QUOTA,
        templateId: IDS.TEMPLATE_DEFAULT,
        policyId: IDS.POLICY_DEFAULT,
        status: 'draft',
        note: '通用占位任务，可复制后按自己的授权页面修改。',
        createdAt: SEED_DATE,
        lastRun: null
      }
    ];
  }

  /** 首次使用必须勾选合规确认；默认浅色、默认不启用真实提交。 */
  function defaultSettings() {
    return {
      complianceAccepted: false,
      theme: 'light',
      liveSubmitEnabled: false
    };
  }

  /** 演练沙箱默认配置：严格遵循 ≥1000ms 间隔与 ≤50 次尝试。 */
  function defaultSandbox() {
    return {
      openInSec: 3,
      initialStock: 2,
      successRate: 0.4,
      competitionRate: 0.2,
      triggerCaptcha: false,
      captchaAtAttempt: 2,
      networkLatencyMs: 200,
      intervalMs: 1000,
      jitterPct: 0,
      maxAttempts: 12,
      warmupSec: 0,
      requireConfirm: true,
      liveSubmit: false
    };
  }

  function defaultLogs() {
    return [];
  }

  /** 完整的初始应用状态（只含 7 个持久化集合，结构扁平便于导出/导入）。 */
  function initialState() {
    return {
      adapters: defaultAdapters(),
      templates: defaultTemplates(),
      policies: defaultPolicies(),
      tasks: defaultTasks(),
      logs: defaultLogs(),
      settings: defaultSettings(),
      sandbox: defaultSandbox()
    };
  }

  var api = {
    NOTE: NOTE,
    IDS: IDS,
    defaultAdapters: defaultAdapters,
    defaultTemplates: defaultTemplates,
    defaultPolicies: defaultPolicies,
    defaultTasks: defaultTasks,
    defaultSettings: defaultSettings,
    defaultSandbox: defaultSandbox,
    defaultLogs: defaultLogs,
    initialState: initialState
  };

  SR.data = api;
  if (isNode) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
