/**
 * Translations. The panel is written in English; `t('English text', {vars})` returns the text in the current
 * language. To add a language, add a dictionary below and map users to it in USER_LANGS (config/home.ts).
 * Missing entries simply fall back to English.
 */
type Dict = Record<string, string>;

const cs: Dict = {
  // menu
  'Control rooms': 'Místnosti', 'Control lights': 'Světla', 'Scenes': 'Scény', 'Appliances': 'Spotřebiče',
  'Energy': 'Energie', 'Blinds': 'Rolety', 'Media': 'Média', 'All devices': 'Všechna zařízení',
  // floors and rooms
  'Ground floor': 'Přízemí', 'Upstairs': 'Patro',
  'Living room': 'Obývací pokoj', 'Kitchen': 'Kuchyně', 'Entrance': 'Předsíň', 'Bedroom': 'Ložnice',
  'Office': 'Pracovna', 'Bathroom': 'Koupelna', 'Landing': 'Chodba',
  // lights, blinds, scenes, devices
  'Ceiling': 'Stropní světlo', 'Floor lamp': 'Stojací lampa', 'Dining pendant': 'Světlo nad stolem',
  'Counter strip': 'Pásek nad linkou', 'Bedside lamp, left': 'Lampička vlevo', 'Bedside lamp, right': 'Lampička vpravo', 'Desk lamp': 'Stolní lampa', 'Mirror light': 'Světlo u zrcadla',
  'Living room blind': 'Roleta v obýváku', 'Kitchen blind': 'Roleta v kuchyni', 'Bedroom blind': 'Roleta v ložnici', 'Office blind': 'Roleta v pracovně',
  'Cooking': 'Vaření', 'Dinner': 'Večeře', 'Movie': 'Film', 'Morning': 'Ráno', 'Good night': 'Dobrou noc', 'All off': 'Vše vypnout',
  'Living room TV': 'Televize v obýváku', 'Robot vacuum': 'Robotický vysavač', 'Dishwasher': 'Myčka', 'TV': 'Televize',
  // sidebar
  'People at home': 'Kdo je doma', 'Inside': 'Uvnitř', 'Outside': 'Venku', 'On': 'Zapnuto',
  'Home Assistant · live': 'Home Assistant · živě', 'Connecting…': 'Připojování…',
  'Home Assistant unreachable · demo': 'Home Assistant nedostupný · demo', 'Demo data': 'Ukázková data',
  'not connected yet': 'zatím nepřipojeno', 'no phone connected yet': 'zatím bez připojeného telefonu', 'Offline · no power?': 'Offline · bez proudu?', 'mostly demo lights': 'většinou ukázková světla', 'Home screen': 'Domovská obrazovka', 'All controls': 'Všechny ovládací prvky', 'Back': 'Zpět', 'Loading…': 'Načítání…', 'Controls': 'Ovládání', 'Status': 'Stav', 'Settings': 'Nastavení', 'Diagnostics': 'Diagnostika', 'Press': 'Stisknout', 'Run': 'Spustit', '{n} entities from Home Assistant': '{n} entit z Home Assistantu', 'Connect Home Assistant to see every control': 'Připojte Home Assistant a uvidíte všechny ovládací prvky', 'Press “{name}”?': 'Stisknout „{name}“?', 'Connected': 'Připojeno', 'Disconnected': 'Odpojeno', 'Problem': 'Problém', 'Close the door to start': 'Zavřete dvířka a spustí se', 'Press Remote Start on the dishwasher': 'Stiskněte na myčce Remote Start', 'Needs attention · check the dishwasher': 'Vyžaduje pozornost · zkontrolujte myčku', 'Waiting': 'Čeká', ' · door open': ' · dvířka otevřená', 'Ready': 'Připraveno', 'No clean logged yet': 'Zatím žádný zaznamenaný úklid', 'home': 'doma', 'away': 'pryč',
  'Hej {name} ♡': 'Ahoj {name} ♡',
  // weather (Home Assistant condition codes)
  'partlycloudy': 'Polojasno', 'cloudy': 'Zataženo', 'sunny': 'Slunečno', 'clear-night': 'Jasno', 'rainy': 'Déšť',
  'pouring': 'Liják', 'snowy': 'Sněžení', 'snowy-rainy': 'Déšť se sněhem', 'fog': 'Mlha', 'windy': 'Větrno',
  'windy-variant': 'Větrno', 'lightning': 'Bouřky', 'lightning-rainy': 'Bouřka s deštěm', 'hail': 'Kroupy', 'exceptional': 'Neobvyklé počasí',
  // floorplan
  'on': 'zapnuto', 'off': 'vypnuto', '{room} {name}, {state}. Long-press for brightness': '{room}, {name}: {state}. Podržením nastavíte jas',
  '{n} on': 'Svítí: {n}', 'Lights off': 'Zhasnuto', '{name}, {p}% open': '{name}: vytaženo {p} %',
  'Electricity price now': 'Aktuální cena elektřiny', 'Play a whole day in 30 seconds': 'Přehrát celý den za 30 sekund', 'Stop the demo': 'Zastavit ukázku', 'Running day/night demo · {time}': 'Ukázka dne a noci · {time}',
  'Day': 'Den', 'Evening': 'Večer',
  // today card
  'Today': 'Dnes', '{dur} left · done {time}': 'zbývá {dur} · hotovo v {time}', 'Starts {time} · cheapest': 'Start v {time} · nejlevněji',
  'Clean dishes · ready to empty': 'Čisté nádobí · můžete vyndat', 'Load it, then tap "Run at cheapest time"': 'Naplňte ji a zapněte „Spustit nejlevněji“',
  'Running': 'Běží', 'Planned': 'Naplánováno', 'Done': 'Hotovo', 'Idle': 'Nečinná',
  'Cleaning the living room · {p}%': 'Uklízí obývací pokoj · {p} %', 'Heading back to the dock': 'Vrací se do stanice',
  'Cleans when you’re both out': 'Uklízí, když jste oba pryč', 'Auto-clean is off': 'Automatický úklid je vypnutý', ' · last {ago}': ' · naposledy {ago}',
  'Cleaning': 'Uklízí', 'Auto': 'Auto', 'Manual': 'Ručně', 'Close at sunset · {time}': 'Zatáhnou se při západu slunce · {time}',
  'just now': 'právě teď', '{n} h ago': 'před {n} h', '{n} d ago': 'před {n} d',
  // panel: lights and blinds
  'Off': 'Vyp.', 'Toggle {name}': 'Přepnout: {name}', '{name} brightness': 'Jas: {name}',
  'Closed': 'Zatažená', 'Open': 'Vytažená', 'Open {name}': 'Vytáhnout: {name}', 'Close {name}': 'Zatáhnout: {name}', '{name} position': 'Poloha: {name}',
  'Select a room on the floorplan to control its lights and blinds.': 'Vyberte místnost na plánku a ovládejte její světla a rolety.',
  '{t} °C · {on} of {n} lights on': '{t} °C · svítí {on} z {n}', '{on} of {n} lights on': 'svítí {on} z {n}', 'Outside, last 24 hours': 'Venku, posledních 24 hodin', 'All on': 'Vše zapnout',
  'Open blinds': 'Vytáhnout rolety', 'Close blinds': 'Zatáhnout rolety',
  '{n} lights on in the house': 'V domě svítí: {n}', 'Tap a scene to set the whole house at once.': 'Klepnutím na scénu nastavíte celý dům najednou.',
  '{o} of {n} open': 'Vytaženo {o} z {n}', 'Open all': 'Vytáhnout vše', 'Close all': 'Zatáhnout vše',
  // media
  'Playing': 'Přehrává', 'Volume': 'Hlasitost', 'TV volume': 'Hlasitost televize', 'Turn off': 'Vypnout', 'Turn on': 'Zapnout',
  'Pause': 'Pauza', 'Play': 'Přehrát', 'Quieter': 'Tišeji', 'Louder': 'Hlasitěji',
  // appliances
  'Cleaning · {p}%': 'Uklízí · {p} %', 'Returning to dock': 'Vrací se do stanice', 'Starting…': 'Spouští se…', 'Resume': 'Pokračovat', 'Docked': 'Ve stanici', ' · {b}% battery': ' · baterie {b} %',
  'Clean': 'Uklidit', 'Dock': 'Do stanice', 'Clean when we’re both out': 'Uklízet, když jsme oba pryč',
  'Last cleaned {ago}': 'Naposledy uklizeno {ago}', 'Not cleaned yet': 'Zatím neuklizeno', ' · once a day, 09–18': ' · jednou denně, 9–18',
  'Running · {dur} left': 'Běží · zbývá {dur}', 'Finished · ready to empty': 'Hotovo · můžete vyndat', 'Loaded': 'Naplněná',
  'Run at cheapest time': 'Spustit nejlevněji', 'Starts {time} · {price} kr/kWh': 'Start v {time} · {price} kr/kWh', ' · saves {kr}': ' · ušetří {kr}',
  'Done by 07:00, using tonight’s prices': 'Hotovo do 7:00, podle nočních cen', 'Start now': 'Spustit hned', 'See prices': 'Zobrazit ceny',
  'Runs {d}× dishwasher · {v}× vacuum this week': 'Tento týden: myčka {d}×, vysavač {v}×',
  'docked': 'Ve stanici', 'cleaning': 'Uklízí', 'returning': 'Vrací se', 'paused': 'Pozastaveno', 'idle': 'Nečinný', 'error': 'Chyba',
  'unknown': 'Neznámý', 'unavailable': 'Nedostupný',
  // energy
  'From Home Assistant statistics': 'Ze statistik Home Assistantu', 'Demo data until the meter and prices are connected': 'Ukázková data, dokud nepřipojíme elektroměr a ceny',
  'Using now': 'Aktuální odběr', 'Price now': 'Cena teď', 'Used today': 'Spotřeba dnes', 'Cost today': 'Náklady dnes',
  'Electricity price today': 'Cena elektřiny dnes', 'Cheapest ahead {h}:00 · {p} kr': 'Nejlevněji v {h}:00 · {p} kr',
  'Cheap': 'Levná', 'Normal': 'Běžná', 'Expensive': 'Drahá', 'Dishwasher planned': 'Naplánovaná myčka',
  'Live prices · use from Eloverblik, a day behind': 'Živé ceny · spotřeba z Eloverblik, o den zpožděná', 'Used {day}': 'Spotřeba {day}', 'Cost {day}': 'Cena {day}', 'Use per hour': 'Spotřeba po hodinách', 'last 24 hours': 'posledních 24 hodin',
  'Dishwasher this week': 'Myčka tento týden', 'runs': 'cyklů', 'Robot vacuum this week': 'Vysavač tento týden', 'cleans': 'úklidů',
  // devices + popover + static page
  '{l} lights · {b} blinds · 3 appliances': 'Světla: {l} · rolety: {b} · spotřebiče: 3',
  'Brightness': 'Jas', 'Warmth': 'Teplota barvy', 'Building the house…': 'Stavím dům…',
};

const EN_WEATHER: Dict = {
  'partlycloudy': 'Partly cloudy', 'cloudy': 'Cloudy', 'sunny': 'Sunny', 'clear-night': 'Clear', 'rainy': 'Rain', 'pouring': 'Heavy rain',
  'snowy': 'Snow', 'snowy-rainy': 'Sleet', 'fog': 'Fog', 'windy': 'Windy', 'windy-variant': 'Windy', 'lightning': 'Thunder',
  'lightning-rainy': 'Thunderstorm', 'hail': 'Hail', 'exceptional': 'Unusual weather',
  'docked': 'Docked', 'cleaning': 'Cleaning', 'returning': 'Returning', 'paused': 'Paused', 'idle': 'Idle', 'error': 'Error',
  'unknown': 'Unknown', 'unavailable': 'Unavailable',
};

const DICTS: Record<string, Dict> = { cs };
const LOCALES: Record<string, string> = { en: 'en-GB', cs: 'cs-CZ' };

let lang = 'en';
export const getLang = () => lang;
export const setLang = (l: string) => { lang = DICTS[l] || l === 'en' ? l : 'en'; document.documentElement.lang = lang; };
export const locale = () => LOCALES[lang] ?? 'en-GB';

export function t(text: string, vars: Record<string, string | number> = {}): string {
  const s = DICTS[lang]?.[text] ?? (lang === 'en' ? EN_WEATHER[text] : undefined) ?? EN_WEATHER[text] ?? text;
  return s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}

/** fills every element marked data-i18n="English text" in index.html */
export function translateStatic() {
  for (const el of document.querySelectorAll<HTMLElement>('[data-i18n]')) el.textContent = t(el.dataset.i18n!);
}
