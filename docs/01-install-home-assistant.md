# 1. Install Home Assistant on the PC (Hyper-V)

Home Assistant OS runs as a virtual machine on the PC for now. It's the same system that will later run on the
Raspberry Pi, so moving is "make a backup, restore it on the Pi" ([guide](04-move-to-raspberry-pi.md)). Hyper-V is already enabled on this PC.

**Shortcut:** steps 1.1–1.3 are automated. In an elevated PowerShell (right-click → *Run as administrator*) in this folder run
`powershell -ExecutionPolicy Bypass -File .\scripts\setup-hyperv.ps1`, then continue at 1.4. The manual steps below do the same thing.

## 1.1 Give the VM its own address on the network
Hyper-V's built-in "Default Switch" hides VMs behind NAT, which breaks device discovery.

1. Open **Hyper-V Manager → Virtual Switch Manager → New virtual network switch → External**.
2. Name it `LAN`, choose **Realtek PCIe 5GbE Family Controller**, keep *Allow management operating system to share this network adapter* ticked.
3. Apply. The PC's network drops for a few seconds.

## 1.2 Download the disk image
From https://www.home-assistant.io/installation/windows download the **Hyper-V (.vhdx)** image and unzip it to a
permanent place, e.g. `C:\HyperV\HomeAssistant\`.

## 1.3 Create the VM
Hyper-V Manager → **New → Virtual Machine**:

| Step | Setting |
|---|---|
| Generation | **Generation 2** |
| Memory | 4096 MB, **Dynamic Memory off** |
| Networking | `LAN` |
| Hard disk | **Use an existing virtual hard disk** → the `.vhdx` |

Before the first start, open the VM's **Settings**:
- **Security**: untick **Enable Secure Boot**
- **Processor**: 2 virtual processors
- **Automatic Start Action**: *Always start this virtual machine automatically*

## 1.4 First start
Start the VM and wait ~5 minutes, then open http://homeassistant.local:8123 and create the owner account.
Set the home location to your address (Home Assistant keeps it to itself and only uses it for sunset times and weather), time zone Europe/Copenhagen, currency DKK.

**Port:** newer Home Assistant versions may set themselves up on port 80. Change it to the standard **8123** under
Settings → System → Network → **HTTP-server → Serverport** (Home Assistant restarts). Several integrations, including
the Xiaomi Home login, only work with `http://homeassistant.local:8123`.

**DNS:** if an integration can't reach its servers ("unable to reach … address"), set the DNS servers under Settings →
System → Network → IPv4/IPv6 to Cloudflare and Google. Some routers fail to look up certain names, like `miot-spec.org`.

If `homeassistant.local` doesn't resolve, look up the VM's IP in the VM console or the router and use that.
Give it a **fixed IP (DHCP reservation) in the router**: the dashboard, Chrome start page and kiosk all point to it.

## 1.5 Keep it running
Automations only run while the PC is on. In Windows **Settings → System → Power** set *Sleep* to *Never*
while the PC is the house's hub.

## 1.6 Add-ons to install now
Settings → Add-ons → Add-on store:
- **Samba share**: lets `npm run deploy` copy the dashboard into HA, and lets you edit config from Explorer (`\\homeassistant.local\config`).
- **File editor** (optional): edit YAML in the browser.
- Then install **HACS** (https://hacs.xyz/docs/use/): needed for the Xiaomi Home and Energi Data Service integrations.

## 1.7 Backups
Settings → System → Backups → set up automatic backups (daily, keep 7). Store a copy off the VM (Google Drive
backup add-on or a network share). The same backup is what moves everything to the Pi later.
