<#
.SYNOPSIS
    测试版 tag 轮转：只保留最近 N 个 test-vNNN tag。

.DESCRIPTION
    按序号倒序排列 test-vNNN，保留最近 $Keep 个（默认 3），其余删除。
    删除只涉及 tag，不删除任何提交历史，被删 tag 指向的代码仍可通过 commit 找回。

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File tools\rotate-test-tags.ps1

.EXAMPLE
    # 先看会删哪些，不实际删除
    powershell -ExecutionPolicy Bypass -File tools\rotate-test-tags.ps1 -DryRun

.EXAMPLE
    # 同时删除远程 tag
    powershell -ExecutionPolicy Bypass -File tools\rotate-test-tags.ps1 -Remote
#>
param(
    [int]$Keep = 3,
    [switch]$Remote,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

if ((git rev-parse --is-inside-work-tree 2>$null) -ne 'true') {
    throw '当前目录不是 Git 仓库，请在项目根目录执行。'
}

$tags = git tag --list 'test-v*' |
    Where-Object { $_ -match '^test-v(\d+)$' } |
    ForEach-Object { [pscustomobject]@{ Tag = $_; No = [int]$Matches[1] } } |
    Sort-Object No -Descending

if (-not $tags) {
    Write-Host '没有 test-vNNN tag，无需处理。'
    return
}

$keepList = @($tags | Select-Object -First $Keep)
$dropList = @($tags | Select-Object -Skip $Keep)

Write-Host ("共 {0} 个测试 tag，保留最近 {1} 个：" -f $tags.Count, $Keep)
$keepList | ForEach-Object { Write-Host ("  保留  {0}" -f $_.Tag) }

if ($dropList.Count -eq 0) {
    Write-Host '无需清理。'
    return
}

foreach ($item in $dropList) {
    if ($DryRun) {
        Write-Host ("  [试运行] 将删除 {0}" -f $item.Tag)
        continue
    }

    git tag -d $item.Tag | Out-Null
    Write-Host ("  已删除本地 tag {0}" -f $item.Tag)

    if ($Remote) {
        git push origin --delete $item.Tag 2>&1 | Out-Null
        Write-Host ("  已删除远程 tag {0}" -f $item.Tag)
    }
}

if (-not $DryRun -and -not $Remote) {
    Write-Host '远程 tag 未删除，需要时加 -Remote 再执行。'
}
