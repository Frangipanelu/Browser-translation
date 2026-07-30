# ============================================================
# 划词翻译助手 - Chrome/Edge 扩展打包脚本
# 将扩展打包为 .crx 文件并生成 Windows 注册表策略
# 消除"开发者模式可能损害系统"的警告
# ============================================================

param(
    [string]$Browser = "chrome",
    [string]$ExtensionDir = $PSScriptRoot
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  划词翻译助手 - 扩展打包工具 v2.0" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# --- 查找浏览器路径 ---
function Find-Browser {
    param([string]$Type)

    $paths = @{
        chrome = @(
            "${env:ProgramFiles}\Google\Chrome\Application\chrome.exe",
            "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
            "${env:LocalAppData}\Google\Chrome\Application\chrome.exe"
        )
        edge = @(
            "${env:ProgramFiles}\Microsoft\Edge\Application\msedge.exe",
            "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
        )
    }

    foreach ($p in $paths[$Type]) {
        if (Test-Path $p) { return $p }
    }
    return $null
}

$browserExe = Find-Browser -Type $Browser

if (-not $browserExe) {
    Write-Host "[X] 未找到 $Browser 浏览器，请确认已安装" -ForegroundColor Red
    Write-Host "    你也可以手动在浏览器地址栏输入 chrome://extensions 或 edge://extensions" -ForegroundColor Yellow
    Write-Host "    开启开发者模式 -> 点击'打包扩展程序' -> 选择此文件夹" -ForegroundColor Yellow
    exit 1
}

Write-Host "[1/4] 找到浏览器: $browserExe" -ForegroundColor Green

# --- 检查扩展目录 ---
$manifestPath = Join-Path $ExtensionDir "manifest.json"
if (-not (Test-Path $manifestPath)) {
    Write-Host "[X] 未找到 manifest.json，请确认扩展目录正确: $ExtensionDir" -ForegroundColor Red
    exit 1
}

Write-Host "[2/4] 扩展目录: $ExtensionDir" -ForegroundColor Green

# --- 打包扩展 ---
$keyPath = Join-Path $ExtensionDir "extension.pem"
$packArgs = @("--pack-extension=`"$ExtensionDir"""")

if (Test-Path $keyPath) {
    $packArgs += "--pack-extension-key=`"$keyPath"""
    Write-Host "[3/4] 使用已有密钥打包..." -ForegroundColor Yellow
} else {
    Write-Host "[3/4] 首次打包，将生成新密钥..." -ForegroundColor Yellow
}

$crxPath = Join-Path $ExtensionDir "word-translator-extension.crx"

# 清理旧的 crx
if (Test-Path $crxPath) { Remove-Item $crxPath -Force }

try {
    $process = Start-Process -FilePath $browserExe -ArgumentList $packArgs -Wait -PassThru -NoNewWindow 2>$null
    Start-Sleep -Seconds 2
} catch {
    Write-Host "    打包进程已执行" -ForegroundColor Yellow
}

if (Test-Path $crxPath) {
    Write-Host "    [OK] .crx 文件已生成: $crxPath" -ForegroundColor Green
} else {
    Write-Host "    [!] 自动打包可能未完成，请手动打包：" -ForegroundColor Yellow
    Write-Host "    1. 打开浏览器 -> chrome://extensions" -ForegroundColor White
    Write-Host "    2. 开启开发者模式" -ForegroundColor White
    Write-Host "    3. 点击'打包扩展程序'" -ForegroundColor White
    Write-Host "    4. 扩展程序根目录选择: $ExtensionDir" -ForegroundColor White
    Write-Host "    5. 首次留空私钥路径，点击打包" -ForegroundColor White
}

# --- 读取扩展 ID ---
Write-Host ""
Write-Host "[4/4] 配置 Windows 策略以消除警告..." -ForegroundColor Yellow

$browserPolicyMap = @{
    chrome = @{ Root = "Google\Chrome"; Name = "Chrome" }
    edge = @{ Root = "Microsoft\Edge"; Name = "Edge" }
}

$policyRoot = $browserPolicyMap[$Browser].Root
$policyName = $browserPolicyMap[$Browser].Name

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  接下来请执行以下步骤：" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "步骤 A: 安装 .crx 扩展" -ForegroundColor White
Write-Host "  1. 打开 ${Browser}://extensions" -ForegroundColor Gray
Write-Host "  2. 将生成的 word-translator-extension.crx 拖入页面" -ForegroundColor Gray
Write-Host "  3. 确认安装，记下扩展 ID（一串字母）" -ForegroundColor Gray
Write-Host ""
Write-Host "步骤 B: 添加注册表策略消除警告" -ForegroundColor White
Write-Host "  方法1（推荐）：右键 run-install-policy.reg -> 合并" -ForegroundColor Gray
Write-Host "  方法2：以管理员身份运行 PowerShell:" -ForegroundColor Gray
Write-Host ""
Write-Host "    // 允许所有扩展（最简单）" -ForegroundColor DarkGray
Write-Host "    New-Item -Path 'HKLM:\SOFTWARE\Policies\$policyRoot\ExtensionInstallAllowlist' -Force" -ForegroundColor DarkGray
Write-Host "    Set-ItemProperty -Path 'HKLM:\SOFTWARE\Policies\$policyRoot\ExtensionInstallAllowlist' -Name '1' -Value '*' -Force" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  添加后重启浏览器，开发者模式警告将不再出现" -ForegroundColor Green
Write-Host ""
Write-Host "步骤 C: 验证" -ForegroundColor White
Write-Host "  打开 ${Browser}://policy 确认策略已生效" -ForegroundColor Gray
Write-Host ""
