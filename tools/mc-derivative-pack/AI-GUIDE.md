# AI-GUIDE · 给大模型的 Minecraft 光影安装说明

> 读者：AI 助手 / 大模型。本文件按步骤结构化，照做即可。
> 目标：为 Minecraft Java 26.1.1 装好 Derivative 光影 + Patrix 材质 + 休闲内容 mod。

## 输入
用户会提供本站下载的 21 个分卷 + parts-manifest.json + 合并脚本，或直接给出已解压的安装包目录。

## 流程总览
```
合并分卷 → 解压 ZIP → 定位 .minecraft → 确认 26.1.1 → 装 Fabric → 复制文件 → 校验 → 告知收尾
```

## 第 0 步：合并分卷（若拿到的是分卷）
- 文件：`Derivative-Main-v4.zip.part01` ~ `part21`（以 parts-manifest.json 为准）、`parts-manifest.json`、`合并脚本.py/.bat/.ps1`，同一文件夹。
- 执行：`python 合并脚本.py`（或双击 `合并脚本.bat`）。
- 脚本行为：校验每个分卷 SHA-256 → 按序合并 → 校验最终 ZIP 的 SHA-256 = `de19aaed9d41048cf7a97000765258ed9a4812ad296ee1d8cb3fc16973a9ecbe`。
- 成功标志：输出 `MERGE OK`，得到 `Derivative-Main-v4-一键安装包.zip`。
- 失败处理：报哪个分卷损坏，就让用户只重下那个分卷，再跑脚本。不要手动拼接二进制。

## 第 1 步：定位 .minecraft
按优先级取第一个含 `versions/` 的目录：
1. 用户直接给的路径
2. `D:\pcl` 下递归搜索（PCL 便携版，通常与 `Plain Craft Launcher 2.exe` 同级）
3. `%APPDATA%\.minecraft`
4. 解压目录同级的 `.minecraft`

## 第 2 步：确认 MC 26.1.1
检查 `<.minecraft>\versions\26.1.1\26.1.1.jar`。不存在 → 让用户先在 PCL 装原版 26.1.1，终止。

## 第 3 步：确认/安装 Fabric 实例
目标：`<.minecraft>\versions\fabric-loader-0.20.1-26.1.1`
若缺 `fabric-loader-0.20.1-26.1.1.json`，用包内安装器（需 Java 25）：
```
"<JAVA>" -jar "<解压目录>\payload\fabric-installer.jar" client -dir "<.minecraft>" -mcversion 26.1.1 -loader 0.20.1
```
`<JAVA>` 优先 `%APPDATA%\.minecraft\runtime\java-runtime-epsilon\bin\java.exe`，否则系统 `java`。

## 第 4 步：复制文件
设 `VER = <.minecraft>\versions\fabric-loader-0.20.1-26.1.1`（缺目录先建 `mods/ shaderpacks/ resourcepacks/ config/`）：
| 源 | 目标 |
| --- | --- |
| `payload\mods\*.jar` | `VER\mods\` |
| `payload\shaderpacks\*.zip` | `VER\shaderpacks\` |
| `payload\resourcepacks\*.zip` | `VER\resourcepacks\` |
| `payload\config\iris.properties` | `VER\config\iris.properties`（覆盖前先备份为 `.bak`） |

**关键**：光影只进实例目录，**绝不**复制到全局 `<.minecraft>\shaderpacks`（否则 26.3 误加载花屏）。材质包可放全局。

## 第 5 步：校验
- 列出 `VER\mods`、`VER\shaderpacks`、`VER\resourcepacks` 文件。
- 确认 `VER\config\iris.properties`：
  - `enableShaders=true`
  - `shaderPack=Derivative [25.1.0] Iris-Fix-Patch.zip`
- 不符则报告。

## 第 6 步：告知用户收尾
- PCL 版本列表**展开折叠卡片**，选 `fabric-loader-0.20.1-26.1.1`（26.3 与 26.1.1 被折在同一卡）。
- 选项 → 资源包：启用 `Patrix 32x`，并启用 Continuity 内置两个包（`default connected textures`、`glass pane culling fix`）；Patrix 排上面。
- Stay True 提示"为旧版本制作"时点"是"。

## 包内容（供核对）
- 34 mod：4 核心（fabric-api 0.155.2 / iris 1.11.2 / sodium 0.9.1 / continuity 3.0.1）+ 30 个 SnuggleCraft 休闲内容 mod。
- 4 光影：Derivative 25.1.0 的 Iris-Fix-Patch（默认）/ Iris-Fix / 原版 + 25.0.1。
- 2 材质包：Patrix 26.1 32x（pack_format 84）、Stay True 1.21.5（pack_format 55）。
- 整合包的旧核心 mod / 12 光影 / 16 材质包已刻意排除，以保留用户自己的选择 —— **不要改动**。

## 约束
1. 26.3 上不要启用 Derivative 光影（会花屏），本包专为 26.1.1。
2. 不删用户已有文件；`iris.properties` 覆盖前留 `.bak`。
3. stdout 有报错就停下，原文报告用户，不猜测成功。
4. 不要再额外导入其它整合包。
5. 若启动崩溃，索取 `logs/latest.log`；可删掉后加的内容 mod 回退到 4 核心。
