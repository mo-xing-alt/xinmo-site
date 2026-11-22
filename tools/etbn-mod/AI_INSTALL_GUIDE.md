# AI 安装指南 · ETBNightmareMod（Escape the Backrooms / Steam 版）

> **本文件的读者是「帮朋友安装的 AI 助手」。**
> 请按本文件的结构化步骤，用命令行 / 文件操作替用户完成安装，并在最后逐条验证。
> 全部操作只需「解压 + 复制文件」，不需要编译、不需要联网下载任何东西。

---

## 0. 一句话任务

把本压缩包里的 **`dwmapi.dll`** 和整个 **`ue4ss`** 文件夹，复制到游戏的
**`...\EscapeTheBackrooms\EscapeTheBackrooms\Binaries\Win64`** 目录下，然后启动游戏验证。

---

## 1. 这是什么 / 装了什么

- 游戏：**Escape the Backrooms**（Steam 版，Unreal Engine 4）。
- 加载器：**UE4SS for Escape the Backrooms**（通过 `dwmapi.dll` 代理注入，Lua Mod 框架）。
- Mod：**ETBNightmareMod**，功能：
  - 每关随机刷「信号枪」当武器，可击杀实体（含细菌 / 蜘蛛 / 触手怪）；
  - 无限体力；`F6` 普通无限体力奔跑；`F7` 噩梦 3 倍速；
  - 场景/实体圣诞皮肤（`F8` 循环，**默认关闭，需手动开**）。
- 包内结构（**这就是要复制的内容**）：

```
ETBNightmareMod_FullCopy.zip
├── dwmapi.dll                 <- 加载器代理 DLL
├── ue4ss/                     <- 加载器 + 所有内置 Mod + 本 Mod
└── README_先读我.txt           <- 包内说明（可忽略，给人看的）
```

---

## 2. 环境要求 / 前置条件

1. Windows 10 / 11，**Steam 版** Escape the Backrooms（不是其他平台/盗版）。
2. **游戏必须完全退出**（含 Steam 里显示"运行中"也要结束进程）。
3. 需要写入游戏目录的权限（Steam 默认在用户可写目录；若在 `C:\Program Files` 下，需管理员权限）。
4. 杀毒软件可能误报 `dwmapi.dll`（代理注入常见误报）。**这是加载器，不是病毒**；若被拦截，把游戏目录加入白名单或临时允许。

---

## 3. 找到游戏目录（三种方法，任选其一，AI 优先用 1 或 2）

**方法 1：Steam 库配置（最可靠）**
读取 `C:\Program Files (x86)\Steam\steamapps\libraryfolders.vdf`（以及 Steam 安装目录下同名文件），
其中 `"path"` 字段就是各个 Steam 库根目录。逐一检查每个库根下的：
`steamapps\common\EscapeTheBackrooms\EscapeTheBackrooms\Binaries\Win64`
哪个存在，就用哪个。

**方法 2：注册表**
`HKCU\Software\Valve\Steam` 的 `SteamPath` 得到 Steam 安装目录，再按方法 1 找库。

**方法 3：全盘搜索**
搜索文件夹名 `EscapeTheBackrooms`，目标是找到同时包含
`Binaries\Win64\EscapeTheBackrooms-Win64-Shipping.exe` 的那一层。

> ⚠️ **路径陷阱（务必注意）**：游戏根目录下**有两层同名的 `EscapeTheBackrooms`**：
> `...\common\EscapeTheBackrooms\EscapeTheBackrooms\Binaries\Win64`
> 第一个是 Steam 应用目录，第二个才是游戏工程目录。**目标一定是 `Binaries\Win64` 这一层。**

**校验目标目录是否正确**：该目录里应能看到 `EscapeTheBackrooms-Win64-Shipping.exe`。

---

## 4. 安装（复制文件）

设目标目录为 `%WIN64%`（即上一步的 `...\Binaries\Win64`）。

1. 把 `ETBNightmareMod_FullCopy.zip` **完整解压**到一个临时文件夹（不要用压缩软件的"直接打开/直接运行"）。
2. 检查解压结果里有 `dwmapi.dll` 和 `ue4ss` 文件夹。
3. **备份**（如果 `%WIN64%` 里已存在同名文件）：
   - 若已有 `dwmapi.dll`，改名为 `dwmapi.dll.bak-etbn`
   - 若已有 `ue4ss` 文件夹，改名为 `ue4ss.bak-etbn`
4. 把解压出来的 **`dwmapi.dll`** 和 **`ue4ss`** 一起复制进 `%WIN64%`。
5. 复制后的正确结构应为：

```
%WIN64%\dwmapi.dll
%WIN64%\ue4ss\UE4SS.dll
%WIN64%\ue4ss\UE4SS-settings.ini
%WIN64%\ue4ss\Mods\mods.txt
%WIN64%\ue4ss\Mods\ETBNightmareMod\Scripts\main.lua
...
```

> 命令示例（PowerShell，AI 可参考；路径按实际替换）：
> ```powershell
> $src = "C:\Temp\ETBNightmareMod_FullCopy"     # 解压目录
> $win64 = "D:\SteamLibrary\steamapps\common\EscapeTheBackrooms\EscapeTheBackrooms\Binaries\Win64"
> Copy-Item "$src\dwmapi.dll" $win64 -Force
> Copy-Item "$src\ue4ss" $win64 -Recurse -Force
> ```

---

## 5. 安装验证（AI 必须逐条检查）

在 `%WIN64%` 下确认以下 4 项（用 `Test-Path` / `dir`）：

| 检查项 | 期望 |
|---|---|
| `%WIN64%\dwmapi.dll` | 存在 |
| `%WIN64%\ue4ss\UE4SS.dll` | 存在 |
| `%WIN64%\ue4ss\Mods\ETBNightmareMod\Scripts\main.lua` | 存在 |
| `%WIN64%\ue4ss\Mods\mods.txt` 内含 `ETBNightmareMod : 1` | 是 |

**运行时验证**：启动游戏（进一次关卡），然后打开
`%WIN64%\ue4ss\UE4SS.log`，搜索以下关键字：

```
Starting Lua mod 'ETBNightmareMod'
[ETBNightmare] 已加载
```

出现即代表 Mod 已生效。

---

## 6. 进游戏后怎么用（热键 / 控制台）

**打开控制台**：游戏内按 `~`（波浪键）或 `,`（逗号）或 `F10`。
（加载器默认会另开一个黑色日志窗口，属正常。）

**热键**：

| 按键 | 功能 |
|---|---|
| `F6` | 普通无限体力奔跑（原版速度 + 无限体力） |
| `F7` | 噩梦模式：跑步 3 倍速 |
| `F8` | 循环切换圣诞皮肤（原版 → 圣诞 → 冰雪 → 糖果 → 金色） |
| `G` | 用手枪（信号枪）开火击杀准星前方实体 |

**常用命令**（控制台输入）：

```
etbn help              查看全部命令
etbn status            查看当前模式 / 体力 / 联机状态
etbn skin christmas    开启圣诞皮肤（默认关闭，需要手动开）
etbn skin off          还原游戏原版外观
etbn skin assets       查看皮肤素材是否加载成功
etbn sync on|off       全房 3 倍速同步（默认关）
etbn fixspeed          速度异常时强制写回原版速度
```

---

## 7. 联机（多个朋友一起玩）

- **每个玩家都要装同一个包**（Mod 是本地加载，不装的人看不到枪/皮肤效果）。
- 3 倍速不是单方面开就生效：**所有人各按一次 `F7`，再由房主输入 `etbn sync on`**；
  只要有人没按 `F7`，那个人会被服务端拉回、跑不动。
- 别人进房主世界 Shift 不能加速：房主按一次 `F6`（或 `etbn fixspeed`）清掉队友身上的残留状态。
- 联机材质不会跨机器同步：皮肤每个人各自 `F8` / `etbn skin christmas` 开启才看得到。

---

## 8. 排错（按症状查）

| 症状 | 处理 |
|---|---|
| **游戏打不开 / 启动即退** | 杀毒拦截了 `dwmapi.dll`；加白名单。仍不行则删除 `%WIN64%\dwmapi.dll` 和 `%WIN64%\ue4ss` 即可完全恢复原版 |
| **控制台按 `~` 没反应** | 确认 `%WIN64%\ue4ss\UE4SS-settings.ini` 里有 `ConsoleEnabled = 1`；或直接看 `ue4ss\UE4SS.log` |
| **命令输入没结果** | 先 `etbn help` 测试；确认日志里有 `Starting Lua mod 'ETBNightmareMod'` |
| **画面出现「一半灰一半原版」** | `etbn skin status` 确认「染色=关」；`etbn skin off` 彻底关皮肤即恢复 |
| **派对客还是原皮** | ★ 皮肤默认是关的：进关等几秒后 `etbn skin christmas` 或 `F8`。游戏内圣诞材质可能加载不到，此时会自动回退引擎材质（仍是可见新皮）。`etbn skin assets` 看 MISS |
| **某些实体（蜘蛛/触手/细菌）打不死** | 换最新包；用 `etbn hits` / `etbn scan all` 看类名，或 `etbn entity <关键词>` 临时补 |
| **帧率变低** | `etbn perf` 看扫描次数；`etbn tick 150` 降低主循环频率 |
| **联机一直转圈 / 超时** | 官方旧版本问题较多；确认双方都是新版游戏；失败房间换新房 + 房间码加入，不要反复重进 |

---

## 9. 卸载（完全恢复原版）

1. 完全退出游戏。
2. 删除 `%WIN64%\dwmapi.dll`
3. 删除 `%WIN64%\ue4ss` 整个文件夹
4. 如有备份，把 `dwmapi.dll.bak-etbn` / `ue4ss.bak-etbn` 改回原名。

---

## 10. 给 AI 的执行清单（照做即可）

- [ ] 确认游戏是 Steam 版、已完全退出
- [ ] 用第 3 节方法定位 `%WIN64%`，并确认存在 `EscapeTheBackrooms-Win64-Shipping.exe`
- [ ] 解压 `ETBNightmareMod_FullCopy.zip` 到临时目录
- [ ] 备份 `%WIN64%` 下已有的 `dwmapi.dll` / `ue4ss`
- [ ] 复制 `dwmapi.dll` 与 `ue4ss` 到 `%WIN64%`
- [ ] 按第 5 节 4 项检查全部通过
- [ ] 告知用户：进游戏按 `~`，输入 `etbn help` 验证；`F6/F7` 切速度，`F8` 开皮肤
- [ ] 把第 6/7/8 节要点转述给用户

> 若任何一步失败，先按第 8 节排错；仍失败再让用户把 `ue4ss\UE4SS.log` 内容发回。
