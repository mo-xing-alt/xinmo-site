# Derivative 安装包 - 分卷合并（PowerShell 版，无需 Python）
# 用法：在本文件所在目录打开 PowerShell，执行  powershell -ExecutionPolicy Bypass -File merge.ps1
# 它会读取 parts-manifest.json，按顺序合并 part01..partNN，并校验最终 SHA-256。

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$manifestPath = Join-Path $here "parts-manifest.json"
if (-not (Test-Path $manifestPath)) {
  Write-Host "[ERROR] 找不到 parts-manifest.json，请把它和所有分卷放在同一文件夹。" -ForegroundColor Red
  exit 1
}
$man = Get-Content $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
Write-Host ("共 {0} 个分卷，目标文件：{1}" -f $man.parts.Count, $man.source_file)
Write-Host ("目标 SHA-256：{0}`n" -f $man.source_sha256)

foreach ($p in $man.parts) {
  $path = Join-Path $here $p.name
  if (-not (Test-Path $path)) { Write-Host "[ERROR] 缺少分卷：$($p.name)" -ForegroundColor Red; exit 1 }
  $actual = (Get-FileHash -Algorithm SHA256 $path).Hash.ToLower()
  if ($actual -ne $p.sha256.ToLower()) {
    Write-Host "[ERROR] 分卷损坏：$($p.name)" -ForegroundColor Red
    Write-Host "   期望 $($p.sha256)"; Write-Host "   实际 $actual"
    exit 1
  }
  Write-Host ("  [OK] {0}  {1:N1} MiB" -f $p.name, ($p.size / 1MB))
}

Write-Host "`n正在合并..."
$outPath = Join-Path $here $man.source_file
$fs = [System.IO.File]::Create($outPath)
try {
  foreach ($p in $man.parts) {
    $path = Join-Path $here $p.name
    $in = [System.IO.File]::OpenRead($path)
    try { $in.CopyTo($fs) } finally { $in.Dispose() }
  }
} finally { $fs.Dispose() }

$finalSha = (Get-FileHash -Algorithm SHA256 $outPath).Hash.ToLower()
$finalSize = (Get-Item $outPath).Length
Write-Host ("`n合并完成：{0} bytes" -f $finalSize)
Write-Host ("实际 SHA-256：{0}" -f $finalSha)
if ($finalSha -ne $man.source_sha256.ToLower()) { Write-Host "[ERROR] SHA-256 不符，文件不完整。" -ForegroundColor Red; exit 1 }
if ($finalSize -ne $man.source_size) { Write-Host "[ERROR] 大小不符。" -ForegroundColor Red; exit 1 }
Write-Host "`n=== MERGE OK ===" -ForegroundColor Green
Write-Host "完整安装包已生成：$outPath"
Write-Host "下一步：解压 ZIP，按页面安装步骤操作。"
