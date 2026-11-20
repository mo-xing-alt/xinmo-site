/* 私人记忆档案 · Web Crypto 薄封装
 * 与 deploy/aesgcm.py + gen_memory_vault.py 的加密契约严格一致：
 *   PBKDF2-HMAC-SHA256 / AES-256-GCM / AAD = private_memory_vault:v1
 * 本文件不发起任何网络请求，不接触 localStorage，只做派生与解密。
 */
(function (global) {
  'use strict';

  var DEFAULT_AAD = 'private_memory_vault:v1';
  var NONCE_BYTES = 12;
  var TAG_BYTES = 16;

  function base64ToBytes(b64) {
    if (typeof b64 !== 'string' || !b64) {
      throw new Error('密文数据为空');
    }
    var binary;
    try {
      binary = global.atob(b64);
    } catch (e) {
      throw new Error('密文 Base64 格式错误');
    }
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  function concatBytes(first, second) {
    var out = new Uint8Array(first.length + second.length);
    out.set(first, 0);
    out.set(second, first.length);
    return out;
  }

  function textBytes(text) {
    return new TextEncoder().encode(text);
  }

  var gateway = {};

  gateway.DEFAULT_AAD = DEFAULT_AAD;

  /** 用口令与文件内 kdf 参数派生 AES-GCM CryptoKey。 */
  gateway.deriveKey = async function deriveKey(pass, kdf, usages) {
    if (!global.crypto || !global.crypto.subtle) {
      throw new Error('当前浏览器不支持 Web Crypto，请使用新版 Chrome 或 Edge。');
    }
    if (!pass || typeof pass !== 'string') {
      throw new Error('请输入站主口令');
    }
    if (!kdf || !kdf.saltB64 || !kdf.iterations) {
      throw new Error('档案缺少 KDF 参数，数据不可用');
    }
    var keyUsages = Array.isArray(usages) && usages.length ? usages : ['decrypt'];
    var baseKey = await global.crypto.subtle.importKey(
      'raw', textBytes(pass), 'PBKDF2', false, ['deriveKey', 'deriveBits']
    );
    var keyLength = (kdf.keyBytes || 32) * 8;
    return global.crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        hash: (kdf.hash === 'SHA-512') ? 'SHA-512' : 'SHA-256',
        salt: base64ToBytes(kdf.saltB64),
        iterations: Number(kdf.iterations)
      },
      baseKey,
      { name: 'AES-GCM', length: keyLength },
      false,
      keyUsages
    );
  };

  /** 解密 verifier（nonce || ciphertext || tag），校验是否为约定常量。 */
  gateway.verifyPassword = async function verifyPassword(key, verifierB64, aad) {
    try {
      var blob = base64ToBytes(verifierB64);
      if (blob.length < NONCE_BYTES + TAG_BYTES) {
        return false;
      }
      var nonce = blob.subarray(0, NONCE_BYTES);
      var body = blob.subarray(NONCE_BYTES);
      var plain = await global.crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: nonce,
          tagLength: TAG_BYTES * 8,
          additionalData: textBytes(aad || DEFAULT_AAD)
        },
        key,
        body
      );
      return new TextDecoder().decode(plain) === 'PMV_OK:v1';
    } catch (e) {
      return false;
    }
  };

  /** 解密 payload（ciphertext || tag）并 JSON.parse；失败 throw。 */
  gateway.decrypt = async function decrypt(key, nonceB64, payloadB64, aad) {
    var nonce = base64ToBytes(nonceB64);
    if (nonce.length !== NONCE_BYTES) {
      throw new Error('nonce 长度异常，数据不可用');
    }
    var body = base64ToBytes(payloadB64);
    if (body.length <= TAG_BYTES) {
      throw new Error('密文数据不完整，数据不可用');
    }
    var plain;
    try {
      plain = await global.crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: nonce,
          tagLength: TAG_BYTES * 8,
          additionalData: textBytes(aad || DEFAULT_AAD)
        },
        key,
        body
      );
    } catch (e) {
      throw new Error('口令错误或数据已被篡改');
    }
    try {
      return JSON.parse(new TextDecoder().decode(plain));
    } catch (e) {
      throw new Error('档案内容解析失败，数据不可用');
    }
  };

  /** 仅用于自检：把字节数组转 Base64。 */
  gateway.bytesToBase64 = function bytesToBase64(bytes) {
    var binary = '';
    for (var i = 0; i < bytes.length; i += 1) {
      binary += String.fromCharCode(bytes[i]);
    }
    return global.btoa(binary);
  };

  gateway._internal = { base64ToBytes: base64ToBytes, concatBytes: concatBytes };

  global.PMVCrypto = gateway;
})(typeof window !== 'undefined' ? window : globalThis);
