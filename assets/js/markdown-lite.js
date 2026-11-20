/* 私人记忆档案 · 零依赖 Markdown 轻量渲染器
 * 安全原则：先做 HTML 实体转义，再做语法替换，杜绝标签注入。
 * 对外接口（挂在 window.PMVMarkdown）：
 *   escapeHtml(text) -> string
 *   slugify(text) -> string
 *   extractHeadings(markdown) -> [{level,text,id}]
 *   render(markdown) -> string (HTML)
 *   renderWithToc(markdown) -> {html, headings}
 */
(function (global) {
  'use strict';

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function slugify(value) {
    var text = String(value == null ? '' : value).toLowerCase();
    text = text.replace(/[\s`*_~[\]()#>.!?,，。！？、：:；;、"'《》<>/\\|]+/g, '-');
    text = text.replace(/-+/g, '-').replace(/^-|-$/g, '');
    return text || 'section';
  }

  /** 先转义再扫描标题，保证 TOC 与渲染使用同一套 id。 */
  function extractHeadings(markdown) {
    var escaped = escapeHtml(markdown || '');
    var lines = escaped.split(/\r?\n/);
    var headings = [];
    var inFence = false;
    for (var i = 0; i < lines.length; i += 1) {
      var line = lines[i];
      if (/^\s*```/.test(line)) {
        inFence = !inFence;
        continue;
      }
      if (inFence) {
        continue;
      }
      var match = /^(#{1,4})\s+(.+?)\s*$/.exec(line);
      if (match) {
        headings.push({
          level: match[1].length,
          text: stripInline(match[2]),
          id: 'sec-' + slugify(stripInline(match[2])) + '-' + headings.length
        });
      }
    }
    return headings;
  }

  /** 从已转义文本里去掉内联标记，得到纯文本标题。 */
  function stripInline(text) {
    return String(text)
      .replace(/`([^`]*)`/g, '$1')
      .replace(/\*\*([^*]*)\*\*/g, '$1')
      .replace(/\*([^*]*)\*/g, '$1')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .trim();
  }

  function isSafeUrl(url) {
    var clean = String(url).replace(/&amp;/g, '&').trim();
    if (!clean) {
      return false;
    }
    if (/^(javascript|data|vbscript|file):/i.test(clean)) {
      return false;
    }
    if (/^https?:\/\//i.test(clean)) {
      return true;
    }
    if (/^(#|\/|\.\/|\.\.\/)/.test(clean)) {
      return true;
    }
    if (/^[a-z0-9._~%+\-]+\.[a-z]{2,}([/:?#]|$)/i.test(clean)) {
      return true;
    }
    // 相对文件名（如 USER.md）允许；未知协议（冒号前缀）拒绝
    return !/^[a-z][a-z0-9+.\-]*:/i.test(clean);
  }

  /** 内联语法：先抽取行内码占位，再处理加粗/斜体/链接，最后还原。 */
  function inline(escapedText) {
    var codes = [];
    var text = String(escapedText).replace(/`([^`]+)`/g, function (all, code) {
      codes.push(code);
      return '\u0000CODE' + (codes.length - 1) + '\u0000';
    });

    text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    text = text.replace(/\[([^\]]*)\]\(([^)\s]+)\)/g, function (all, label, url) {
      if (!isSafeUrl(url)) {
        return label;
      }
      return '<a href="' + url + '" target="_blank" rel="noopener">' + label + '</a>';
    });
    text = text.replace(/\u0000CODE(\d+)\u0000/g, function (all, index) {
      return '<code>' + codes[Number(index)] + '</code>';
    });
    return text;
  }

  /** 渲染为 HTML。入参为原始 Markdown；内部第一步即转义。 */
  function render(markdown) {
    var escaped = escapeHtml(markdown || '');
    var lines = escaped.split(/\r?\n/);
    var headings = [];
    var output = [];
    var paragraph = [];
    var listType = '';
    var inFence = false;
    var fenceLines = [];

    function flushParagraph() {
      if (paragraph.length) {
        output.push('<p>' + inline(paragraph.join(' ')) + '</p>');
        paragraph = [];
      }
    }

    function flushList() {
      if (listType) {
        output.push('</' + listType + '>');
        listType = '';
      }
    }

    function flushAll() {
      flushParagraph();
      flushList();
    }

    for (var i = 0; i < lines.length; i += 1) {
      var line = lines[i];

      // 围栏代码块（内部内容已转义）
      if (/^\s*```/.test(line)) {
        if (inFence) {
          output.push('<pre><code>' + fenceLines.join('\n') + '</code></pre>');
          fenceLines = [];
          inFence = false;
        } else {
          flushAll();
          inFence = true;
        }
        continue;
      }
      if (inFence) {
        fenceLines.push(line);
        continue;
      }

      // 空行
      if (!line.trim()) {
        flushAll();
        continue;
      }

      // 分割线
      if (/^\s*---+\s*$/.test(line)) {
        flushAll();
        output.push('<hr />');
        continue;
      }

      // 标题（转义后 > 变为 &gt;，# 不受影响）
      var headingMatch = /^(#{1,4})\s+(.+?)\s*$/.exec(line);
      if (headingMatch) {
        flushAll();
        var level = headingMatch[1].length;
        var plain = stripInline(headingMatch[2]);
        var id = 'sec-' + slugify(plain) + '-' + headings.length;
        headings.push({ level: level, text: plain, id: id });
        output.push('<h' + level + ' id="' + id + '">' + inline(headingMatch[2]) + '</h' + level + '>');
        continue;
      }

      // 引用
      var quoteMatch = /^&gt;\s?(.*)$/.exec(line);
      if (quoteMatch) {
        flushAll();
        output.push('<blockquote><p>' + inline(quoteMatch[1]) + '</p></blockquote>');
        continue;
      }

      // 无序列表
      var bulletMatch = /^\s*[-*]\s+(.+)$/.exec(line);
      if (bulletMatch) {
        flushParagraph();
        if (listType !== 'ul') {
          flushList();
          output.push('<ul>');
          listType = 'ul';
        }
        output.push('<li>' + inline(bulletMatch[1]) + '</li>');
        continue;
      }

      // 有序列表
      var orderedMatch = /^\s*\d+\.\s+(.+)$/.exec(line);
      if (orderedMatch) {
        flushParagraph();
        if (listType !== 'ol') {
          flushList();
          output.push('<ol>');
          listType = 'ol';
        }
        output.push('<li>' + inline(orderedMatch[1]) + '</li>');
        continue;
      }

      // 普通段落行
      paragraph.push(line.trim());
    }

    if (inFence && fenceLines.length) {
      output.push('<pre><code>' + fenceLines.join('\n') + '</code></pre>');
    }
    flushAll();
    return output.join('\n');
  }

  function renderWithToc(markdown) {
    return { html: render(markdown), headings: extractHeadings(markdown) };
  }

  global.PMVMarkdown = {
    escapeHtml: escapeHtml,
    slugify: slugify,
    extractHeadings: extractHeadings,
    render: render,
    renderWithToc: renderWithToc
  };
})(typeof window !== 'undefined' ? window : globalThis);
