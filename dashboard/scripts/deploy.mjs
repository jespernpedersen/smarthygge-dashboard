// Copies the built dashboard into Home Assistant's www folder over the Samba share add-on.
// Served afterwards at  http://homeassistant.local:8123/local/smarthygge/index.html
//
//   npm run deploy                         (uses the default share path below)
//   HA_WWW=\\<HA-IP>\config\www\smarthygge npm run deploy
import { cpSync, existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, 'dist');
const target = process.env.HA_WWW ?? '\\\\homeassistant.local\\config\\www\\smarthygge';

if (!existsSync(dist)) { console.error('No dist/ folder – run "npm run build" first.'); process.exit(1); }
const share = dirname(dirname(target));
if (!existsSync(share)) {
  console.error(`Can't reach ${share}.\nInstall the "Samba share" add-on in Home Assistant, open the share once in Explorer and sign in, or set HA_WWW to the right path.`);
  process.exit(1);
}
mkdirSync(target, { recursive: true });
rmSync(join(target, 'assets'), { recursive: true, force: true });
cpSync(dist, target, { recursive: true });
// Home Assistant serves /local/ with a 31-day cache. The real page goes to app.html and index.html becomes a
// fixed loader that always asks for app.html fresh (the hashed assets it references are safe to cache).
renameSync(join(target, 'index.html'), join(target, 'app.html'));
writeFileSync(join(target, 'index.html'), `<!doctype html><meta charset="utf-8"><title>Smart Hygge</title><style>html{background:#1b1c1f}</style>
<script>var q=location.search;location.replace('app.html'+(q?q+'&':'?')+'v='+Date.now()+location.hash)</script>\n`);
console.log(`Deployed to ${target}\nOpen http://homeassistant.local:8123/local/smarthygge/index.html`);
