/* ============================================================
 * 新模学习 · 全站 AI 小助手（悬浮窗）
 * ------------------------------------------------------------
 * 用法：在页面 </body> 前加一行（相对路径按页面深度调整）：
 *   <script src="[前缀]assets/js/ai-assistant.js"></script>
 * 组件自动生成自身 DOM 与样式，无需改动页面其它结构。
 *
 * 可用 window.XM_AI_CONFIG 覆盖配置（须在引入本脚本前设置）：
 *   apiBase   后端地址，默认 https://ai.xinmo.work
 *   greeting  欢迎语
 *   chips     空态快捷提问数组
 * 安全：本文件不含任何 API Key，凭证只在后端。
 * ============================================================ */
(function () {
  "use strict";
  if (window.__xmAIReady) return;
  window.__xmAIReady = true;

  var CFG = Object.assign(
    {
      apiBase: "https://ai.xinmo.work",
      greeting: "你好，我是新模学习的 AI 小助手 📚\n可以帮我解答学习问题、整理知识点、润色文字或讲解代码。有什么想了解的？",
      chips: ["帮我总结一个知识点", "解释一道题的思路", "润色这段文字", "写一段示例代码"],
      cssPath: "assets/css/ai-assistant.css",
    },
    window.XM_AI_CONFIG || {}
  );

  // 依据本脚本 src 推导资源前缀，保证各级目录页面都能加载到 CSS
  function basePrefix() {
    var s = document.currentScript || (function () {
      var ss = document.getElementsByTagName("script");
      return ss[ss.length - 1];
    })();
    var src = (s && s.src) || "";
    var i = src.lastIndexOf("assets/js/ai-assistant.js");
    return i >= 0 ? src.slice(0, i) : "";
  }
  var PREFIX = basePrefix();

  // ---------- 样式 ----------
  function loadCSS() {
    if (document.querySelector('link[data-xm-ai-css]')) return;
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = PREFIX + CFG.cssPath;
    link.setAttribute("data-xm-ai-css", "1");
    document.head.appendChild(link);
  }

  // ---------- 图标 ----------
  var ICON_CHAT =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';
  var ICON_STAR =
    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="m12 2.4 2.9 6 6.6.9-4.8 4.6 1.2 6.5-5.9-3.1-5.9 3.1 1.2-6.5L2.5 9.3l6.6-.9 2.9-6Z"/></svg>';
  var ICON_SEND =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7z"/></svg>';

  // ---------- DOM ----------
  var fab, panel, body, input, sendBtn, emptyEl;
  var history = []; // [{role,content}]
  var busy = false;

  function esc(s) {
    var d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function scrollBottom() {
    body.scrollTop = body.scrollHeight;
  }

  function build() {
    var root = document.createElement("div");
    root.className = "xm-ai";

    fab = document.createElement("button");
    fab.className = "xm-ai-fab";
    fab.type = "button";
    fab.setAttribute("aria-label", "打开 AI 小助手");
    fab.innerHTML = ICON_CHAT + '<span class="xm-ai-dot"></span>';
    fab.addEventListener("click", openPanel);

    panel = document.createElement("section");
    panel.className = "xm-ai-panel";
    panel.setAttribute("aria-label", "AI 小助手聊天窗口");
    panel.hidden = true;
    panel.innerHTML =
      '<div class="xm-ai-head">' +
      '<div class="xm-ai-logo">' + ICON_STAR + "</div>" +
      '<div class="xm-ai-title"><b>新模 AI 助手</b><small>学以报国 · 技以利民</small></div>' +
      '<button class="xm-ai-close" type="button" aria-label="关闭">×</button>' +
      "</div>" +
      '<div class="xm-ai-body"></div>' +
      '<div class="xm-ai-foot">' +
      '<form class="xm-ai-form">' +
      '<textarea class="xm-ai-input" rows="1" placeholder="输入你的问题，Enter 发送…"></textarea>' +
      '<button class="xm-ai-send" type="submit" aria-label="发送">' + ICON_SEND + "</button>" +
      "</form>" +
      '<div class="xm-ai-bar">' +
      '<label class="xm-ai-think-toggle" title="开启后 AI 会先思考再回答，速度较慢但推理更充分">' +
      '<input type="checkbox" id="xm-ai-think"><span>深度思考</span></label>' +
      '<span class="xm-ai-hint">AI 回答仅供参考</span>' +
      "</div>" +
      "</div>";

    body = panel.querySelector(".xm-ai-body");
    input = panel.querySelector(".xm-ai-input");
    sendBtn = panel.querySelector(".xm-ai-send");

    panel.querySelector(".xm-ai-close").addEventListener("click", closePanel);
    panel.querySelector(".xm-ai-form").addEventListener("submit", onSubmit);
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (!busy) panel.querySelector(".xm-ai-form").requestSubmit();
      }
    });
    input.addEventListener("input", function () {
      input.style.height = "auto";
      input.style.height = Math.min(input.scrollHeight, 96) + "px";
    });

    root.appendChild(fab);
    root.appendChild(panel);
    document.body.appendChild(root);
    showEmpty();
  }

  function showEmpty() {
    emptyEl = document.createElement("div");
    emptyEl.className = "xm-ai-empty";
    var chips = CFG.chips
      .map(function (c) {
        return '<button class="xm-ai-chip" type="button">' + esc(c) + "</button>";
      })
      .join("");
    emptyEl.innerHTML =
      '<div class="xm-ai-empty-ico">' + ICON_STAR + "</div>" +
      "<p>" + esc(CFG.greeting).replace(/\n/g, "<br>") + "</p>" +
      '<div class="xm-ai-chips">' + chips + "</div>";
    emptyEl.querySelectorAll(".xm-ai-chip").forEach(function (b) {
      b.addEventListener("click", function () {
        input.value = b.textContent;
        input.focus();
      });
    });
    body.appendChild(emptyEl);
  }

  function openPanel() {
    panel.hidden = false;
    fab.hidden = true;
    if (!history.length) input.focus();
    else scrollBottom();
  }
  function closePanel() {
    panel.hidden = true;
    fab.hidden = false;
  }

  function addUser(text) {
    if (emptyEl) { emptyEl.remove(); emptyEl = null; }
    var wrap = document.createElement("div");
    wrap.className = "xm-ai-msg me";
    wrap.innerHTML = '<div class="xm-ai-who">我</div><div class="xm-ai-bubble"></div>';
    wrap.querySelector(".xm-ai-bubble").textContent = text;
    body.appendChild(wrap);
    scrollBottom();
  }

  // 返回一个控制器，供流式写入
  function addAssistantShell() {
    var wrap = document.createElement("div");
    wrap.className = "xm-ai-msg ai";
    wrap.innerHTML =
      '<div class="xm-ai-who">AI 助手</div>' +
      '<details class="xm-ai-think live" style="display:none">' +
      "<summary>思考过程</summary><div class=\"xm-ai-think-text\"></div></details>" +
      '<div class="xm-ai-bubble"><span class="xm-ai-wait"><span class="xm-ai-dots"><span></span><span></span><span></span></span> 正在连接 AI…</span></div>';
    body.appendChild(wrap);
    var thinkBox = wrap.querySelector(".xm-ai-think");
    var thinkText = wrap.querySelector(".xm-ai-think-text");
    var bubble = wrap.querySelector(".xm-ai-bubble");
    var reasoning = "";
    var answer = "";
    var bubbleReady = false;

    return {
      reasoning: function (t) {
        reasoning += t;
        thinkBox.style.display = "";
        thinkText.textContent = reasoning;
        thinkBox.classList.add("live");
        scrollBottom();
      },
      content: function (t) {
        if (!bubbleReady) {
          bubble.textContent = "";
          bubble.classList.add("xm-ai-caret");
          bubbleReady = true;
        }
        answer += t;
        bubble.textContent = answer;
        thinkBox.classList.remove("live");
        scrollBottom();
      },
      finish: function () {
        bubble.classList.remove("xm-ai-caret");
        if (!answer) bubble.textContent = "（无回复内容）";
        scrollBottom();
      },
      fail: function (msg) {
        bubble.classList.remove("xm-ai-caret");
        bubble.textContent = "⚠️ " + msg;
        scrollBottom();
      },
      getAnswer: function () { return answer; },
    };
  }

  function onSubmit(e) {
    e.preventDefault();
    if (busy) return;
    var text = input.value.trim();
    if (!text) return;
    send(text);
  }

  function send(text) {
    busy = true;
    input.value = "";
    input.style.height = "auto";
    sendBtn.disabled = true;
    addUser(text);

    history.push({ role: "user", content: text });
    var shell = addAssistantShell();

    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, 45000);

    var thinkOn = !!(panel.querySelector("#xm-ai-think") || {}).checked;
    fetch(CFG.apiBase.replace(/\/$/, "") + "/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: history.slice(), thinking: thinkOn }),
      signal: controller.signal,
    })
      .then(function (resp) {
        if (!resp.ok) throw new Error("服务返回 " + resp.status);
        if (!resp.body) throw new Error("浏览器不支持流式读取");
        return resp.body.getReader();
      })
      .then(function (reader) {
        var decoder = new TextDecoder("utf-8");
        var buf = "";
        function pump() {
          return reader.read().then(function (result) {
            if (result.done) { finishUp(); return; }
            buf += decoder.decode(result.value, { stream: true });
            var idx;
            while ((idx = buf.indexOf("\n\n")) >= 0) {
              var block = buf.slice(0, idx);
              buf = buf.slice(idx + 2);
              var line = block.trim();
              if (line.indexOf("data: ") !== 0) continue;
              var payload = line.slice(6).trim();
              if (payload === "[DONE]") { finishUp(); return; }
              var obj;
              try { obj = JSON.parse(payload); } catch (_) { continue; }
              if (obj.type === "reasoning" && obj.text) shell.reasoning(obj.text);
              else if (obj.type === "content" && obj.text) shell.content(obj.text);
              else if (obj.type === "done") {
                // 服务端明确结束：立即收尾，并取消后续读取，避免连接未断时干等超时
                finishUp();
                try { reader.cancel(); } catch (_) {}
                return;
              }
              else if (obj.type === "error") {
                shell.fail((obj.error || "请求失败") + (obj.detail ? "：" + obj.detail : ""));
                finishUp(true);
                return;
              }
            }
            return pump();
          });
        }
        function finishUp(failed) {
          clearTimeout(timer);
          if (!failed) {
            shell.finish();
            history.push({ role: "assistant", content: shell.getAnswer() });
            if (history.length > 20) history = history.slice(-20);
          }
          busy = false;
          sendBtn.disabled = false;
          input.focus();
        }
        return pump();
      })
      .catch(function (err) {
        clearTimeout(timer);
        var msg = err.name === "AbortError" ? "请求超时，请重试" : "连接失败：" + (err.message || err);
        shell.fail(msg);
        busy = false;
        sendBtn.disabled = false;
      });
  }

  function init() {
    loadCSS();
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", build);
    } else {
      build();
    }
  }
  init();
})();
