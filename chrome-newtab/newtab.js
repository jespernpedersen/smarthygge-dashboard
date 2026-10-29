// Chrome extensions can't show another site inside the new tab page itself (Home Assistant's login refuses to be
// framed), so the tab goes straight to the dashboard. Change the address here if Home Assistant moves.
location.replace('http://homeassistant.local:8123/local/smarthygge/index.html');
