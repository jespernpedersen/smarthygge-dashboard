# Sets up Home Assistant OS as a Hyper-V virtual machine on this PC.
# Run once in an elevated PowerShell (right-click PowerShell → Run as administrator):
#   powershell -ExecutionPolicy Bypass -File .\scripts\setup-hyperv.ps1
#
# What it does:
#   1. creates an External virtual switch "LAN" on the wired network adapter (network drops for a few seconds)
#   2. downloads the latest Home Assistant OS Hyper-V disk (.vhdx) from GitHub
#   3. creates the VM: Generation 2, 4 GB fixed memory, 2 CPUs, Secure Boot off, starts with Windows
#   4. starts it
# Safe to re-run: steps that are already done are skipped.

param(
  [string]$VmName = 'HomeAssistant',
  [string]$Folder = 'C:\HyperV\HomeAssistant',
  [string]$SwitchName = 'LAN',
  [string]$Adapter = 'Ethernet'
)
$ErrorActionPreference = 'Stop'

$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) { throw 'Run this from an elevated PowerShell (Run as administrator).' }
if (-not (Get-Command New-VM -ErrorAction SilentlyContinue)) { throw 'Hyper-V PowerShell module not found. Enable Hyper-V in Windows Features first.' }

# 1. network switch
if (-not (Get-VMSwitch -Name $SwitchName -ErrorAction SilentlyContinue)) {
  Write-Host "Creating external switch '$SwitchName' on '$Adapter' (network drops briefly)..."
  New-VMSwitch -Name $SwitchName -NetAdapterName $Adapter -AllowManagementOS $true | Out-Null
} else { Write-Host "Switch '$SwitchName' already exists." }

# 2. disk image
New-Item -ItemType Directory -Force $Folder | Out-Null
$vhdx = Get-ChildItem $Folder -Filter 'haos_ova-*.vhdx' -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $vhdx) {
  $rel = Invoke-RestMethod 'https://api.github.com/repos/home-assistant/operating-system/releases/latest' -Headers @{ 'User-Agent' = 'smarthygge-setup' }
  $asset = $rel.assets | Where-Object { $_.name -like 'haos_ova-*.vhdx.zip' } | Select-Object -First 1
  if (-not $asset) { throw "No .vhdx download found in release $($rel.tag_name)." }
  $zip = Join-Path $Folder $asset.name
  Write-Host "Downloading $($asset.name) ($([math]::Round($asset.size/1MB)) MB)..."
  Invoke-WebRequest -UseBasicParsing $asset.browser_download_url -OutFile $zip
  Expand-Archive $zip -DestinationPath $Folder -Force
  Remove-Item $zip
  $vhdx = Get-ChildItem $Folder -Filter 'haos_ova-*.vhdx' | Select-Object -First 1
}
Write-Host "Disk: $($vhdx.FullName)"

# 3. virtual machine
if (-not (Get-VM -Name $VmName -ErrorAction SilentlyContinue)) {
  Write-Host "Creating VM '$VmName'..."
  New-VM -Name $VmName -Generation 2 -MemoryStartupBytes 4GB -VHDPath $vhdx.FullName -SwitchName $SwitchName -Path $Folder | Out-Null
  Set-VMMemory -VMName $VmName -DynamicMemoryEnabled $false
  Set-VMProcessor -VMName $VmName -Count 2
  Set-VMFirmware -VMName $VmName -EnableSecureBoot Off
  Set-VM -Name $VmName -AutomaticStartAction Start -AutomaticStopAction ShutDown -CheckpointType Disabled
} else { Write-Host "VM '$VmName' already exists." }

# 4. start
if ((Get-VM -Name $VmName).State -ne 'Running') { Start-VM -Name $VmName }
Write-Host ''
Write-Host 'Home Assistant is booting. In about 5 minutes open:  http://homeassistant.local:8123'
Write-Host 'Then continue with docs/01-install-home-assistant.md from step 1.4.'
