Escape the Backrooms · 原版还原包（无任何 Mod）
================================================

给谁用：装过「噩梦」模组、现在想回原版的朋友。
原则：**不删除任何东西**。工具会把 Mod 相关文件移到备份文件夹，随时能搬回来。

------------------------------------------------
一、最简单：直接运行
------------------------------------------------
1. 先完全退出游戏（Steam 里也别显示"运行中"）。
2. 解压本包到一个临时文件夹（比如桌面）。
3. 双击【一键还原.bat】。
4. 看它打印的状态，然后输入：
     full    = 完全原版（推荐，把 dwmapi.dll 和 ue4ss 文件夹都移走）
     loader  = 只禁用模组，保留 UE4SS 加载器
     undo    = 后悔了，把刚才移走的搬回来
     check   = 只检查，啥也不改
5. 完成后启动游戏验证。

如果双击 .bat 提示没有 Python 3，先装 Python（https://www.python.org/downloads/，
安装时勾选 "Add Python to PATH"），或者把你解压后的文件夹连同 AI_RESTORE_GUIDE.md
一起发给大模型，让它照着做。

------------------------------------------------
二、手动运行（会用命令行的话）
------------------------------------------------
在解压目录打开 PowerShell / CMD：

    python ETB_Restore_Vanilla.py --check              # 只看状态
    python ETB_Restore_Vanilla.py --mode full --dry-run # 预演
    python ETB_Restore_Vanilla.py --mode full           # 真正执行
    python ETB_Restore_Vanilla.py --undo                # 撤销

它会自动找游戏目录；找不到就用 --path 指定：

    python ETB_Restore_Vanilla.py --path "D:/Steam/steamapps/common/EscapeTheBackrooms/EscapeTheBackrooms/Binaries/Win64" --mode full

------------------------------------------------
三、还原后是什么样
------------------------------------------------
Win64 里不再有 dwmapi.dll 和 ue4ss 文件夹，游戏就是 Steam 原版：
没有随机手枪、没有无限体力、没有 F6/F7/F8，也没有圣诞皮肤。
游戏本体、存档、Steam 都不受影响，随时可以再把「噩梦」模组包装回去。

移走的文件在这个位置（每层 EscapeTheBackrooms 的内层工程目录下）：
    ...\EscapeTheBackrooms\EscapeTheBackrooms\_ETB_mod_backup_时间戳\
里面原封不动放着 dwmapi.dll 和 ue4ss\。想恢复模组就运行 --undo，
或者手动把它们复制回 Binaries\Win64。

------------------------------------------------
四、手动版的「只禁用模组」
------------------------------------------------
不想动加载器、只想让模组不生效？把本包【干净文件\mods.txt】复制到：
    Binaries\Win64\ue4ss\Mods\mods.txt   （覆盖）
再把 Binaries\Win64\ue4ss\Mods\ETBNightmareMod 整个文件夹删掉或改名即可。
（用 --mode loader 可以一步做完，而且不会真的删除。）

------------------------------------------------
五、常见问题
------------------------------------------------
Q：运行后游戏还是三倍速/无限体力？
A：游戏进程没完全退出。先在任务管理器结束 Backrooms-Win64-Shipping.exe，
   再重新运行一次 --mode full。

Q：Steam 提示文件缺失？
A：原版本身没问题。Steam 库 → 游戏右键 → 属性 → 已安装文件 → 验证完整性。

Q：--undo 说"目标已存在"？
A：说明 Win64 里已经有同名文件（可能你又重装过模组）。先手动把 Win64 里的
   dwmapi.dll / ue4ss 改名，再执行 --undo。

Q：能不能把我存档也还原？
A：不需要。本模组不联网、不改存档，存档一直是原版的。

------------------------------------------------
六、包内文件
------------------------------------------------
ETB_Restore_Vanilla.py       主工具（Python 3，无第三方依赖）
一键还原.bat                 Windows 双击入口
干净文件\mods.txt             所有模组都设为 0 的干净清单
干净文件\UE4SS-settings.ini  关掉控制台、恢复默认值的加载器配置
原版文件清单.txt             原版 Win64 应该有哪些文件
AI_RESTORE_GUIDE.md          给大模型看的详细步骤（把本包发给 AI 时读它）
安装说明_给朋友.txt          给人看的简版说明
SHA256SUMS.txt               文件校验值
