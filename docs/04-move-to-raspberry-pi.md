# 5. Move from the PC to the Raspberry Pi

Everything is built on the PC first. The PC runs the same Home Assistant OS as the Pi will, so moving is a
backup and a restore. Nothing has to be set up twice.

## What moves with the backup
Integrations and their logins (TRÅDFRI, Xiaomi Home, Energi Data Service…), entity names, users (household members,
kiosk), automations, scenes, helpers, history and energy statistics, add-ons, and the deployed dashboard in
`/config/www/smarthygge`.

## What stays on the PC
This repository (the dashboard source). You keep editing and building on the PC; `npm run deploy` then copies to
the Pi instead of the VM, and nothing else changes.

## Steps
1. **Hardware:** Raspberry Pi 5 (4–8 GB), official power supply, and an NVMe SSD (M.2 HAT) or a USB SSD. Avoid running from an SD card.
2. **On the PC VM:** Settings → System → Backups → **Create backup → Full backup**, download the `.tar` file, and note the backup's encryption key.
3. **Flash the Pi:** Raspberry Pi Imager → *Other specific-purpose OS → Home assistants → Home Assistant OS (RPi 5)* → write to the SSD.
4. **Shut down the VM** (Hyper-V Manager → HomeAssistant → Shut down) so two Home Assistants don't fight over the same devices.
5. Boot the Pi on Ethernet, open http://homeassistant.local:8123, and on the welcome screen choose
   **Restore from backup** with the `.tar` file and its key. It takes 10–30 minutes.
6. **Same address:** move the router's DHCP reservation from the VM to the Pi, or keep using `homeassistant.local`.
   The Chrome start page, everyone's devices and the kiosk then work unchanged.
7. Check: lights respond, Xiaomi devices show up, the dashboard loads, and the automations' last-triggered times update.
8. When everything has run for a week, delete the VM in Hyper-V Manager. Remove the `LAN` switch only if nothing else uses it.

## Gotchas
- **USB devices** (if a Zigbee USB stick is added later) have to be plugged into the Pi and re-selected in the
  integration. A network coordinator like the SLZB-06 avoids this.
- If `homeassistant.local` doesn't resolve on some device, use the fixed IP.
