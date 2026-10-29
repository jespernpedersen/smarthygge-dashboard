# 3. Dashboard access: your PC, the rest of the household, and a kitchen tablet

The dashboard is a static web app. Home Assistant serves it from its `www` folder, and it signs in with Home
Assistant accounts, so everyone uses their own HA login.

## 3.1 Deploy it into Home Assistant
With the Samba share add-on running (open `\\homeassistant.local\config` in Explorer once and sign in):

```bash
cd dashboard
npm run deploy
```

It's then at **http://homeassistant.local:8123/local/smarthygge/index.html**. Run `npm run deploy` again after
each change. If the share has a different address, set `HA_WWW`, e.g.
`HA_WWW=\\<HA-IP>\config\www\smarthygge npm run deploy`.

Files in `www` are public on the home network, but the page shows nothing from the house until someone signs in
to Home Assistant.

## 3.2 Put it in the Home Assistant sidebar
Settings → Dashboards → **Add dashboard → Webpage**: URL `/local/smarthygge/index.html`, title *Smart Hygge*,
icon `mdi:floor-plan`. It now appears in the sidebar for every user, and inside HA it reuses HA's login.

## 3.3 Chrome start page on the PC
Chrome → Settings → **On startup → Open a specific page or set of pages → Add a new page** →
`http://homeassistant.local:8123/local/smarthygge/index.html` (or the fixed IP). The first visit sends you to HA's login.

## 3.4 Other people in the household
1. Settings → People → **Add person**, switch on *Allow person to log in*, create their username and password.
   Leave *Administrator* off unless they need to change settings.
2. They open the same URL on a laptop or phone while on the home Wi-Fi, or use the Companion app, where the
   dashboard is in the sidebar.

## 3.5 Kitchen kiosk tablet (later)
1. Create a non-admin user `kiosk` in Home Assistant, sign in once as `kiosk`, and under its profile → Security →
   **Long-lived access tokens** create one named "Kitchen tablet".
2. On the Android tablet install **Fully Kiosk Browser** and set the start URL to
   `http://<HA-IP>:8123/local/smarthygge/index.html?token=<the token>`
   The token is stored on the tablet and removed from the address bar. To revoke it, delete the token in HA.
3. Add the **Fully Kiosk Browser** integration in HA to control screen on/off and brightness, and to wake the
   screen on motion.
4. Charge through a smart plug and add an automation that keeps the battery between 20 % and 80 %.

## 3.6 From outside the house (later)
Either **Home Assistant Cloud (Nabu Casa)** or **Tailscale** (add-on), then use the Companion app. Don't open
Home Assistant's port on the router.
