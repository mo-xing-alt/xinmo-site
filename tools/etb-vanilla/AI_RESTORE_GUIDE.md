# AI 还原指南 · 把 Escape the Backrooms 恢复到无任何 Mod 的原版状态

> **本文件读者是「帮朋友还原游戏的大模型助手」。**
> 请读完第 0～3 节再动手；操作时严格遵守第 2 节的安全边界；最后按第 6 节逐条验证。
> 全程不需要编译、不需要联网下载。只需要 Python 3（Windows 可从微软商店装，或 https://www.python.org/downloads/ ）。

---

## 0. 一句话任务

把游戏目录 `...\EscapeTheBackrooms\EscapeTheBackrooms\Binaries\Win64` 里的
**`dwmapi.dll`** 和 **`ue4ss\` 文件夹**移走，使游戏回到 Steam 原版状态。
**不是删除，是移动到带时间戳的备份文件夹**（随时可撤销）。

---

## 1. 包内容（解压后你会看到）

```
ETB_原版还原包.zip
├── ETB_Restore_Vanilla.py          # 主工具：定位 + 备份 + 还原 + 检查 + 撤销
├── 一键还原.bat                    # Windows 双击入口（会调用上面的 py）
├── 干净文件/
│   ├── mods.txt                    # 所有条目为 0：保留加载器但禁用全部模组
│   └── UE4SS-settings.ini          # 控制台关闭、恢复默认值的加载器配置
├── 原版文件清单.txt                # 原版 Win64 应有哪些文件（用于人工核对）
├── README_先读我.txt               # 人类简版说明
├── 安装说明_给朋友.txt             # 人类简版说明（另一份）
└── SHA256SUMS.txt                  # 校验值
```

注意：**包里没有游戏本体、没有 ETBNightmareMod 的 Lua 脚本**。它只负责清理。

---

## 2. 安全边界（必须遵守）

1. 先确认 **游戏完全退出**：任务管理器里不能有 `Backrooms-Win64-Shipping.exe`。
2. **只允许改动 `Binaries\Win64` 里的 Mod 相关项**：`dwmapi.dll`、`ue4ss\`、`*.etbn-backup`。
3. **不要删除整个 Win64、不要删除游戏 exe、不要删除存档、不要动 Steam 目录**。
4. 工具默认把文件移入 `<游戏工程目录>\_ETB_mod_backup_YYYYMMDD_HHMMSS\`。
   备份目录若已存在同名项，工具会跳过而不是覆盖。
5. 先用 `--dry-run` 预演，确认输出符合预期后再真正执行。
6. 如果 `--path` 指向的目录没有游戏主程序，工具会拒绝执行——这是保护，不要绕过。

---

## 3. 找到游戏目录（AI 优先用方法 1）

**方法 1：直接调用工具自动定位（推荐）**

```powershell
python ETB_Restore_Vanilla.py --check
```

工具会依次尝试：`--path` 参数 → 环境变量 `ETB_WIN64` → `STEAMPATH` →
常见 Steam 库路径 → 各盘符的 `steamapps\common\...` 搜索。

**方法 2：Steam 库配置**
读 `C:\Program Files (x86)\Steam\steamapps\libraryfolders.vdf` 里的 `"path"` 字段，
每个库根下检查 `steamapps\common\EscapeTheBackrooms\EscapeTheBackrooms\Binaries\Win64`。

**方法 3：全盘搜索**
搜索 `EscapeTheBackrooms-Win64-Shipping.exe` 或 `Backrooms-Win64-Shipping.exe`。

> ⚠️ **路径陷阱**：有两层同名 `EscapeTheBackrooms`：
> `...\common\EscapeTheBackrooms\EscapeTheBackrooms\Binaries\Win64`
> 目标是第二层下面的 `Binaries\Win64`，不是第一层。

**目录正确性校验**：该目录必须含 `Backrooms-Win64-Shipping.exe`
（部分版本叫 `EscapeTheBackrooms-Win64-Shipping.exe`），否则就是找错了。

---

## 4. 三种还原模式（选一个）

### A. 完全原版（默认，最推荐）

移走 `dwmapi.dll` + 整个 `ue4ss\` + 残留 `*.etbn-backup`。玩起来和刚从 Steam 装完一样。

```powershell
python ETB_Restore_Vanilla.py --check                 # 先看状态
python ETB_Restore_Vanilla.py --mode full --dry-run   # 预演
python ETB_Restore_Vanilla.py --mode full             # 真正执行
```

### B. 只禁用模组（保留 UE4SS 加载器）

只移走 `ue4ss\Mods\ETBNightmareMod`，并把 `mods.txt` 换成包内的干净版本
（所有条目 `: 0`）。加载器还在，但不会启用任何 Mod。

```powershell
python ETB_Restore_Vanilla.py --mode loader
# 若还想把控制台等设置恢复默认：
python ETB_Restore_Vanilla.py --mode loader --reset-settings
```

### C. 只检查 / 撤销

```powershell
python ETB_Restore_Vanilla.py --check      # 什么也不改，只报告
python ETB_Restore_Vanilla.py --undo       # 把最近一次备份的东西搬回去
```

**手动等价操作（无 Python 时）**：
完全原版 = 把 Win64 里的 `dwmapi.dll` 和 `ue4ss\` 剪切到一个备份文件夹；
只禁用模组 = 删除/改名 `ue4ss\Mods\ETBNightmareMod`，再用包内 `干净文件\mods.txt` 覆盖
`ue4ss\Mods\mods.txt`。

若工具找不到目录，显式指定：

```powershell
python ETB_Restore_Vanilla.py --path "D:/Steam/steamapps/common/EscapeTheBackrooms/EscapeTheBackrooms/Binaries/Win64" --mode full
```

---

## 5. 成功后的预期输出

`--check` 应报告：

```
dwmapi.dll（加载器代理）: 不存在
ue4ss\（加载器目录）    : 不存在
噩梦模组目录            : 不存在
已有还原备份            : 1 个（最近：_ETB_mod_backup_20261122_214500）
```

`--mode full` 结束应打印：`完成：移动了 N 项到 _ETB_mod_backup_...`

---

## 6. 验证（必须逐条做）

1. 再次运行 `python ETB_Restore_Vanilla.py --check`，三项都显示「不存在」。
2. 打开 Win64 目录，肉眼确认没有 `dwmapi.dll`、没有 `ue4ss\` 文件夹。
3. 对照包内 `原版文件清单.txt`，主程序等原版文件仍在。
4. **启动游戏**，进一局：没有随机手枪、体力会耗尽、F6/F7/F8 无效果。
5. 若以后想装回模组：把「噩梦」模组的 FullCopy 包按它的 AI 安装指南复制进去即可；
   或运行 `--undo` 恢复刚才移走的整个加载器。

---

## 7. 排错表

| 现象 | 原因 | 处理 |
|---|---|---|
| `[X] 目录校验失败：找不到游戏主程序` | 路径选错层级 | 用 `--path` 指向含 `Backrooms-Win64-Shipping.exe` 的 `Binaries\Win64` |
| 提示 Python 不是内部命令 | 没装 Python 或未加 PATH | 装 Python 3 并勾选 Add to PATH；或双击 `一键还原.bat` |
| 游戏里仍然无限体力 / 三倍速 | 游戏进程没退干净 | 任务管理器结束进程后重跑 `--mode full` |
| `--undo` 提示「目标已存在」 | Win64 里已有同名文件 | 先把现有的 `dwmapi.dll` / `ue4ss` 改名，再 `--undo` |
| Steam 提示文件缺失 | 与本工具无关的游戏文件问题 | Steam → 属性 → 已安装文件 → 验证游戏完整性 |
| 杀毒软件报 dwmapi.dll | 代理注入常见误报 | 还原后该文件已被移走，无需处理 |

---

## 8. AI 执行清单（按顺序勾）

- [ ] 读取本文件 0～3 节，确认游戏已退出
- [ ] 用 `--check` 找到并校验 `Binaries\Win64`
- [ ] 用 `--mode full --dry-run` 预演，核对输出
- [ ] 用 `--mode full` 执行（或按用户要求选 `loader`）
- [ ] 再跑一次 `--check`，确认三项都「不存在」
- [ ] 告知用户备份文件夹的路径与 `--undo` 用法
- [ ] 让用户启动游戏做最终确认

---

## 9. 边界说明

本模组不联网、不修改游戏存档、不修改游戏本体文件。
还原后存档、成就、Steam 好友与设置均保持原样。
`dwmapi.dll` 与 `ue4ss\` 均为加载器新增项，不是 Steam 原版的一部分。
