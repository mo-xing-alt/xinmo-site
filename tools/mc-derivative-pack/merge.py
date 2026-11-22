#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Derivative 安装包 · 分卷合并脚本
========================================
用途：把本站下载的 9 个 .zip.partNN 分卷合并回完整的安装包 ZIP，并校验完整性。

【给 AI 助手 / 大模型】
执行方式（在本脚本所在目录，或把脚本和所有 part 文件放同一文件夹）：
    python merge.py
脚本会自动：
  1. 读取 parts-manifest.json 得到分卷顺序与每个分卷的 SHA-256
  2. 逐个校验分卷是否完整（损坏会明确报出是哪个分卷）
  3. 按 part01..part09 顺序合并成 "Derivative-Main-v4-一键安装包.zip"
  4. 校验合并结果的 SHA-256 是否等于清单里的 source_sha256
成功后打印 "MERGE OK" 和完整文件路径；失败会打印具体原因并退出码 1。
依赖：仅 Python 标准库，无需联网、无需第三方包。

【给朋友（人类）】
把所有 part 文件和 parts-manifest.json 下载到同一个文件夹，双击运行本脚本
（或在该文件夹打开命令行执行 python merge.py），等它说 MERGE OK 即可。
合并出来的 ZIP 就是完整安装包，再按页面上的安装步骤继续。
========================================
"""
import os, sys, hashlib, json

HERE = os.path.dirname(os.path.abspath(__file__))
MANIFEST = os.path.join(HERE, "parts-manifest.json")


def sha256_of(path, chunk=1 << 20):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(chunk), b""):
            h.update(block)
    return h.hexdigest()


def main():
    if not os.path.exists(MANIFEST):
        print("[ERROR] 找不到 parts-manifest.json，请把它和所有分卷放在同一文件夹。")
        return 1
    with open(MANIFEST, encoding="utf-8") as f:
        man = json.load(f)

    parts = man["parts"]
    out_name = man["source_file"]
    out_path = os.path.join(HERE, out_name)
    print(f"共 {len(parts)} 个分卷，目标文件：{out_name}")
    print(f"目标 SHA-256：{man['source_sha256']}\n")

    # 1) 先校验所有分卷存在且哈希正确
    for p in parts:
        path = os.path.join(HERE, p["name"])
        if not os.path.exists(path):
            print(f"[ERROR] 缺少分卷：{p['name']}")
            return 1
        actual = sha256_of(path)
        if actual != p["sha256"]:
            print(f"[ERROR] 分卷损坏：{p['name']}")
            print(f"   期望 {p['sha256']}")
            print(f"   实际 {actual}")
            print("   请重新下载这个分卷。")
            return 1
        print(f"  [OK] {p['name']}  {p['size']/1048576:.1f} MiB")

    # 2) 按顺序合并
    print("\n正在合并...")
    with open(out_path, "wb") as out:
        for p in parts:
            with open(os.path.join(HERE, p["name"]), "rb") as f:
                while True:
                    block = f.read(1 << 20)
                    if not block:
                        break
                    out.write(block)

    # 3) 校验最终结果
    final_sha = sha256_of(out_path)
    final_size = os.path.getsize(out_path)
    print(f"\n合并完成：{final_size} bytes")
    print(f"实际 SHA-256：{final_sha}")
    if final_sha != man["source_sha256"]:
        print("[ERROR] 合并结果 SHA-256 与清单不符，文件可能不完整。")
        return 1
    if final_size != man["source_size"]:
        print(f"[ERROR] 合并结果大小不符：期望 {man['source_size']}，实际 {final_size}")
        return 1
    print("\n=== MERGE OK ===")
    print(f"完整安装包已生成：{out_path}")
    print("下一步：解压这个 ZIP，把里面的文件夹交给大模型执行安装，或双击 Install.bat。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
