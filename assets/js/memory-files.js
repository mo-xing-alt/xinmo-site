/* ============================================================
 * 私人记忆档案 · 节点文件管理（IndexedDB，纯本地）
 * ------------------------------------------------------------
 * 每个记忆节点可独立添加 / 列出 / 下载 / 删除附件。
 * 文件只存当前浏览器本地（IndexedDB），不上传服务器、不联网。
 * 键：nodeId；值：该节点下的文件数组 [{id,name,type,size,blob,addedAt}]。
 * ============================================================ */
(function (global) {
  "use strict";

  var DB_NAME = "xinmo_memory_files";
  var DB_VER = 1;
  var STORE = "files";
  var db = null;

  function open() {
    return new Promise(function (resolve, reject) {
      if (db) { resolve(db); return; }
      if (!global.indexedDB) { reject(new Error("浏览器不支持 IndexedDB")); return; }
      var req = global.indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = function () {
        var d = req.result;
        if (!d.objectStoreNames.contains(STORE)) {
          d.createObjectStore(STORE, { keyPath: "nodeId" });
        }
      };
      req.onsuccess = function () { db = req.result; resolve(db); };
      req.onerror = function () { reject(req.error || new Error("打开数据库失败")); };
    });
  }

  function tx(mode, fn) {
    return open().then(function (d) {
      return new Promise(function (resolve, reject) {
        var t = d.transaction(STORE, mode);
        var store = t.objectStore(STORE);
        var result;
        try { result = fn(store); } catch (e) { reject(e); return; }
        t.oncomplete = function () { resolve(result && result.result !== undefined ? result.result : result); };
        t.onerror = function () { reject(t.error || new Error("数据库操作失败")); };
        if (result && typeof result.then === "function") {
          result.then(function (v) { result = v; }, function () {});
        }
      });
    });
  }

  function get(nodeId) {
    return open().then(function (d) {
      return new Promise(function (resolve, reject) {
        var req = d.transaction(STORE, "readonly").objectStore(STORE).get(nodeId);
        req.onsuccess = function () { resolve(req.result ? req.result.files : []); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function put(nodeId, files) {
    return open().then(function (d) {
      return new Promise(function (resolve, reject) {
        var req = d.transaction(STORE, "readwrite").objectStore(STORE)
          .put({ nodeId: nodeId, files: files });
        req.onsuccess = function () { resolve(true); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function add(nodeId, fileList) {
    return get(nodeId).then(function (files) {
      var arr = Array.prototype.slice.call(files);
      var jobs = Array.prototype.map.call(fileList, function (f) {
        return new Promise(function (resolve, reject) {
          var reader = new FileReader();
          reader.onload = function () {
            arr.push({
              id: "f" + Date.now() + Math.random().toString(36).slice(2, 7),
              name: f.name || "未命名文件",
              type: f.type || "application/octet-stream",
              size: f.size || 0,
              blob: reader.result,
              addedAt: Date.now()
            });
            resolve();
          };
          reader.onerror = function () { reject(reader.error); };
          reader.readAsArrayBuffer(f);
        });
      });
      return Promise.all(jobs).then(function () { return put(nodeId, arr).then(function () { return arr; }); });
    });
  }

  function remove(nodeId, fileId) {
    return get(nodeId).then(function (files) {
      var arr = files.filter(function (f) { return f.id !== fileId; });
      return put(nodeId, arr).then(function () { return arr; });
    });
  }

  function download(nodeId, fileId) {
    return get(nodeId).then(function (files) {
      var f = files.filter(function (x) { return x.id === fileId; })[0];
      if (!f) throw new Error("文件不存在");
      var blob = new Blob([f.blob], { type: f.type });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url; a.download = f.name;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      return true;
    });
  }

  function count(nodeId) {
    return get(nodeId).then(function (f) { return f.length; });
  }

  global.MemoryFiles = {
    add: add, list: get, remove: remove, download: download, count: count
  };
})(window);
