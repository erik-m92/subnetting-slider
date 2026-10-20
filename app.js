'use strict';

/* ------------------------------------------------------------------
 * Grundfunktionen
 * Alle Berechnungen laufen mit normalen Zahlen (keine Bit-Operatoren),
 * damit Werte ab 2^31 kein Vorzeichenproblem bekommen.
 * ------------------------------------------------------------------ */
const $ = (sel) => document.querySelector(sel);
const POW32 = 2 ** 32;
const fmt = (n) => n.toLocaleString('de-DE');
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = (arr) => arr[rnd(0, arr.length - 1)];
const plural = (n, one, many) => (n === 1 ? one : many);

const maskFromPrefix = (p) => (p === 0 ? 0 : POW32 - 2 ** (32 - p));
const blockSize = (p) => 2 ** (32 - p);
const toDotted = (n) => [
  Math.floor(n / 16777216) % 256,
  Math.floor(n / 65536) % 256,
  Math.floor(n / 256) % 256,
  n % 256,
].join('.');
const networkOf = (ip, p) => Math.floor(ip / blockSize(p)) * blockSize(p);
const usableHosts = (p) => (p >= 31 ? (p === 31 ? 2 : 1) : blockSize(p) - 2);
// Wert eines angefangenen Masken-Oktetts: 1 Bit -> 128 ... 8 Bits -> 255
const octetValue = (bits) => (bits === 0 ? 0 : 256 - 2 ** (8 - bits));
// Umkehrung, nur für gültige Masken-Oktette (0, 128, 192, ..., 255)
const bitsOfOctet = (v) => (v === 0 ? 0 : 8 - Math.log2(256 - v));

function parseIp(str) {
  const parts = String(str).trim().split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const v = Number(part);
    if (v > 255) return null;
    n = n * 256 + v;
  }
  return n;
}

function rangeInfo(net, p) {
  const bc = net + blockSize(p) - 1;
  if (p === 32) return { net, first: net, last: net, bc: null };
  if (p === 31) return { net, first: net, last: bc, bc: null };
  return { net, first: net + 1, last: bc - 1, bc };
}

/* ------------------------------------------------------------------
 * Bit-Darstellung (32 Zellen in 4 Oktetten)
 * ------------------------------------------------------------------ */
function renderBits(el, prefix, splitAt = null) {
  const octets = toDotted(maskFromPrefix(prefix)).split('.');
  let html = '';
  for (let o = 0; o < 4; o++) {
    html += '<div class="octet"><div class="cells">';
    for (let b = 0; b < 8; b++) {
      const i = o * 8 + b;
      let cls = i < prefix ? 'net' : 'host';
      if (splitAt !== null && i >= splitAt && i < prefix) cls = 'borrowed';
      html += `<button type="button" class="cell ${cls}" data-bit="${i}" title="Bit ${i + 1}">${i < prefix ? 1 : 0}</button>`;
    }
    html += `</div><div class="octet-val">${octets[o]}</div></div>`;
  }
  el.innerHTML = html;
}

// Klick auf eine Zelle verschiebt die Grenze: Netzbit -> wird Hostbit, Hostbit -> wird Netzbit
function bindBitClicks(el, getPrefix, setPrefix) {
  el.addEventListener('click', (e) => {
    const cell = e.target.closest('.cell');
    if (!cell) return;
    const i = Number(cell.dataset.bit);
    const current = getPrefix();
    setPrefix(i < current ? i : i + 1);
  });
}

/* ------------------------------------------------------------------
 * 1 · Explorer
 * ------------------------------------------------------------------ */
const ex = {
  prefix: $('#prefix'),
  out: $('#prefix-out'),
  bits: $('#ex-bits'),
  summary: $('#ex-summary'),
  mask: $('#ex-mask'),
  wildcard: $('#ex-wildcard'),
  addr: $('#ex-addr'),
  hosts: $('#ex-hosts'),
  ip: $('#ex-ip'),
  net: $('#ex-net'),
  first: $('#ex-first'),
  last: $('#ex-last'),
  bc: $('#ex-bc'),
};

function updateExplorer() {
  const p = Number(ex.prefix.value);
  const hostBits = 32 - p;
  const mask = maskFromPrefix(p);

  ex.out.textContent = `/${p}`;
  renderBits(ex.bits, p);

  ex.summary.innerHTML =
    `<b>/${p}</b> = ${p} Netzbits + ${hostBits} Hostbits → ` +
    `2<sup>${hostBits}</sup> = <b>${fmt(blockSize(p))}</b> Adressen, davon <b>${fmt(usableHosts(p))}</b> nutzbare Hosts.`;

  ex.mask.textContent = toDotted(mask);
  ex.wildcard.textContent = toDotted(POW32 - 1 - mask);
  ex.addr.innerHTML = `${fmt(blockSize(p))} <small>= 2<sup>${hostBits}</sup></small>`;

  let hostNote = '';
  if (p === 31) hostNote = ' <small>(Punkt-zu-Punkt, RFC 3021)</small>';
  if (p === 32) hostNote = ' <small>(einzelner Host)</small>';
  ex.hosts.innerHTML = fmt(usableHosts(p)) + hostNote;

  const ip = parseIp(ex.ip.value);
  ex.ip.classList.toggle('invalid', ip === null);
  if (ip === null) {
    for (const k of ['net', 'first', 'last', 'bc']) ex[k].textContent = '–';
    return;
  }
  const r = rangeInfo(networkOf(ip, p), p);
  ex.net.textContent = `${toDotted(r.net)}/${p}`;
  ex.first.textContent = toDotted(r.first);
  ex.last.textContent = toDotted(r.last);
  ex.bc.textContent = r.bc === null ? '–' : toDotted(r.bc);
}

ex.prefix.addEventListener('input', updateExplorer);
ex.ip.addEventListener('input', updateExplorer);
bindBitClicks(ex.bits, () => Number(ex.prefix.value), (p) => {
  ex.prefix.value = Math.max(0, Math.min(32, p));
  updateExplorer();
});

/* ------------------------------------------------------------------
 * 2 · Netz teilen
 * ------------------------------------------------------------------ */
const sp = {
  ip: $('#sp-ip'),
  parent: $('#sp-parent'),
  parentOut: $('#sp-parent-out'),
  child: $('#sp-child'),
  childOut: $('#sp-child-out'),
  chips: $('#sp-chips'),
  summary: $('#sp-summary'),
  bits: $('#sp-bits'),
  parentBar: $('#sp-parent-bar'),
  blocks: $('#sp-blocks'),
  blocksNote: $('#sp-blocks-note'),
  tbody: $('#sp-tbody'),
  tableNote: $('#sp-table-note'),
};
const MAX_BLOCKS = 64;
const MAX_ROWS = 16;

function updateSplit() {
  const parent = Number(sp.parent.value);
  let child = Number(sp.child.value);
  if (child < parent) {
    child = parent;
    sp.child.value = child;
  }
  const k = child - parent;
  const count = 2 ** k;
  const step = blockSize(child);

  sp.parentOut.textContent = `/${parent}`;
  sp.childOut.textContent = `/${child}`;
  sp.chips.querySelectorAll('.chip').forEach((btn) => {
    btn.classList.toggle('active', Number(btn.dataset.k) === k);
  });

  const ipRaw = parseIp(sp.ip.value);
  sp.ip.classList.toggle('invalid', ipRaw === null);
  const base = ipRaw === null ? 0 : networkOf(ipRaw, parent);
  const baseStr = ipRaw === null ? '?' : toDotted(base);

  if (k === 0) {
    sp.summary.innerHTML =
      `Teilnetz-CIDR = Ausgangs-CIDR: <b>${baseStr}/${parent}</b> bleibt ein einziges Netz mit ` +
      `${fmt(blockSize(parent))} Adressen. Wähle oben eine Anzahl oder schiebe den unteren Regler nach rechts.`;
  } else {
    sp.summary.innerHTML =
      `<b>/${parent} → /${child}</b>: ${k} ${plural(k, 'Bit', 'Bits')} geliehen → ` +
      `2<sup>${k}</sup> = <b>${fmt(count)} ${plural(count, 'Teilnetz', 'Teilnetze')}</b> mit je ` +
      `${fmt(step)} Adressen (${fmt(usableHosts(child))} nutzbare Hosts).`;
  }

  renderBits(sp.bits, child, parent);

  // Balken: oben das Ausgangsnetz, darunter die Teilnetze
  sp.parentBar.textContent = `${baseStr}/${parent} · ${fmt(blockSize(parent))} Adressen`;
  const shown = Math.min(count, MAX_BLOCKS);
  let blocks = '';
  for (let i = 0; i < shown; i++) {
    const addr = toDotted(base + i * step);
    const label = count <= 8 ? `${addr}/${child}` : count <= 16 ? addr : '';
    blocks += `<div class="block" title="${addr}/${child}">${label}</div>`;
  }
  sp.blocks.innerHTML = blocks;
  sp.blocksNote.textContent =
    count > MAX_BLOCKS ? `Dargestellt sind die ersten ${MAX_BLOCKS} von ${fmt(count)} Teilnetzen.` : '';

  // Tabelle
  const rows = Math.min(count, MAX_ROWS);
  let trs = '';
  for (let i = 0; i < rows; i++) {
    const r = rangeInfo(base + i * step, child);
    trs +=
      `<tr><td>${i + 1}</td>` +
      `<td class="mono">${toDotted(r.net)}/${child}</td>` +
      `<td class="mono">${toDotted(r.first)}</td>` +
      `<td class="mono">${toDotted(r.last)}</td>` +
      `<td class="mono">${r.bc === null ? '–' : toDotted(r.bc)}</td></tr>`;
  }
  sp.tbody.innerHTML = trs;
  sp.tableNote.textContent = count > MAX_ROWS ? `… und ${fmt(count - MAX_ROWS)} weitere Teilnetze.` : '';
}

// Beim Verschieben des Ausgangsnetzes bleibt die Anzahl der geliehenen Bits erhalten
let lastParent = Number(sp.parent.value);
sp.parent.addEventListener('input', () => {
  const parent = Number(sp.parent.value);
  const k = Number(sp.child.value) - lastParent;
  sp.child.value = Math.min(32, parent + Math.max(0, k));
  lastParent = parent;
  updateSplit();
});
sp.child.addEventListener('input', updateSplit);
sp.ip.addEventListener('input', updateSplit);
sp.chips.addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  sp.child.value = Math.min(32, Number(sp.parent.value) + Number(chip.dataset.k));
  updateSplit();
});
bindBitClicks(sp.bits, () => Number(sp.child.value), (p) => {
  sp.child.value = Math.max(Number(sp.parent.value), Math.min(32, p));
  updateSplit();
});

function setSplit({ ip, parent, child }) {
  if (ip) sp.ip.value = ip;
  sp.parent.value = parent;
  lastParent = parent;
  sp.child.value = child;
  updateSplit();
}

/* ------------------------------------------------------------------
 * 3 · Übungen
 * ------------------------------------------------------------------ */
const parseCidrAnswer = (s) => {
  const m = String(s).trim().match(/^\/?\s*(\d{1,2})$/);
  return m ? Number(m[1]) : null;
};
const parseIntAnswer = (s) => {
  const t = String(s).replace(/[\s.,'_]/g, '');
  return /^\d+$/.test(t) ? Number(t) : null;
};
function parseIpCidrAnswer(s) {
  const m = String(s).trim().match(/^(\d{1,3}(?:\.\d{1,3}){3})(?:\s*\/\s*(\d{1,2}))?$/);
  if (!m) return null;
  const ip = parseIp(m[1]);
  if (ip === null) return null;
  return { ip, prefix: m[2] === undefined ? null : Number(m[2]) };
}
// Adresse muss stimmen; ein angegebenes Präfix muss ebenfalls stimmen
const ipMatches = (s, ip, prefix) => {
  const r = parseIpCidrAnswer(s);
  return !!r && r.ip === ip && (r.prefix === null || r.prefix === prefix);
};

const BASES = ['10.0.0.0', '10.64.0.0', '10.128.0.0', '172.16.0.0', '172.20.0.0', '172.24.0.0', '192.168.0.0', '192.168.100.0'];
const HOST_NEEDS = [5, 10, 14, 25, 30, 50, 60, 100, 120, 126, 200, 250, 254, 300, 500, 510, 1000, 1022, 2000, 4000, 5000, 10000];

function randomHostIp() {
  const kind = rnd(0, 2);
  if (kind === 0) return parseIp(`10.${rnd(0, 255)}.${rnd(0, 255)}.${rnd(1, 254)}`);
  if (kind === 1) return parseIp(`172.${rnd(16, 31)}.${rnd(0, 255)}.${rnd(1, 254)}`);
  return parseIp(`192.168.${rnd(0, 255)}.${rnd(1, 254)}`);
}

// Erklärung "Maske -> CIDR" bzw. "CIDR -> Maske" in Oktett-Schritten
function maskBreakdown(p) {
  const full = Math.floor(p / 8);
  const rest = p % 8;
  return { full, rest, octet: octetValue(rest), dotted: toDotted(maskFromPrefix(p)) };
}

const GENERATORS = {
  // --- Netze teilen ---
  splitCidr() {
    const parent = rnd(8, 26);
    const k = rnd(1, Math.min(5, 30 - parent));
    const n = 2 ** k;
    const child = parent + k;
    return {
      html: `Ein <b>/${parent}</b>-Netz soll in <b>${n}</b> gleich große Teilnetze geteilt werden. Welche CIDR haben die Teilnetze?`,
      placeholder: 'z. B. /20',
      isCorrect: (a) => parseCidrAnswer(a) === child,
      answerText: `/${child}`,
      hint: `${n} Teilnetze = 2<sup>?</sup> – die Hochzahl ist die Anzahl der Bits, die du leihen musst.`,
      explain: `${n} = 2<sup>${k}</sup> → ${k} ${plural(k, 'Bit', 'Bits')} leihen → /${parent} + ${k} = <b>/${child}</b>.`,
      view: { section: 'split', parent, child },
    };
  },
  splitCount() {
    const parent = rnd(8, 24);
    const k = rnd(1, 6);
    const child = parent + k;
    return {
      html: `Ein <b>/${parent}</b>-Netz wird in <b>/${child}</b>-Netze aufgeteilt. Wie viele Teilnetze entstehen?`,
      placeholder: 'Anzahl',
      isCorrect: (a) => parseIntAnswer(a) === 2 ** k,
      answerText: fmt(2 ** k),
      hint: `Wie viele Bits liegen zwischen /${parent} und /${child}? Jedes Bit verdoppelt die Anzahl.`,
      explain: `/${child} − /${parent} = ${k} ${plural(k, 'Bit', 'Bits')} → 2<sup>${k}</sup> = <b>${fmt(2 ** k)}</b> Teilnetze.`,
      view: { section: 'split', parent, child },
    };
  },
  borrowBits() {
    const parent = rnd(8, 26);
    const k = rnd(1, Math.min(6, 30 - parent));
    const n = 2 ** k;
    return {
      html: `Wie viele Bits musst du leihen, um ein <b>/${parent}</b>-Netz in <b>${n}</b> gleich große Teilnetze zu teilen?`,
      placeholder: 'Anzahl Bits',
      isCorrect: (a) => parseIntAnswer(a) === k,
      answerText: String(k),
      hint: `Welche Zweierpotenz ergibt ${n}?`,
      explain: `2<sup>${k}</sup> = ${n} → <b>${k}</b> ${plural(k, 'Bit', 'Bits')}. Die Teilnetze sind dann /${parent + k}.`,
      view: { section: 'split', parent, child: parent + k },
    };
  },

  // --- Hosts & Größe ---
  hosts() {
    const p = rnd(16, 30);
    const hb = 32 - p;
    return {
      html: `Wie viele <b>nutzbare Host-Adressen</b> bietet ein <b>/${p}</b>-Netz?`,
      placeholder: 'Anzahl Hosts',
      isCorrect: (a) => parseIntAnswer(a) === usableHosts(p),
      answerText: fmt(usableHosts(p)),
      hint: `32 − ${p} = ${hb} Hostbits. Zwei Adressen (Netzadresse, Broadcast) fallen weg.`,
      explain: `32 − ${p} = ${hb} Hostbits → 2<sup>${hb}</sup> = ${fmt(blockSize(p))} Adressen − 2 = <b>${fmt(usableHosts(p))}</b>.`,
      view: { section: 'explorer', prefix: p },
    };
  },
  fitHosts() {
    const H = pick(HOST_NEEDS);
    let n = 1;
    while (2 ** n < H + 2) n++;
    const p = 32 - n;
    return {
      html: `Du brauchst ein Netz für <b>mindestens ${fmt(H)} Hosts</b>. Welche CIDR ist die kleinstmögliche, die ausreicht?`,
      placeholder: 'z. B. /24',
      isCorrect: (a) => parseCidrAnswer(a) === p,
      answerText: `/${p}`,
      hint: `Gesucht ist die kleinste Zweierpotenz, die ≥ ${fmt(H)} + 2 ist.`,
      explain:
        `${fmt(H)} + 2 = ${fmt(H + 2)} ≤ 2<sup>${n}</sup> = ${fmt(2 ** n)} → ${n} Hostbits → 32 − ${n} = <b>/${p}</b> ` +
        `(${fmt(usableHosts(p))} nutzbare Hosts).`,
      view: { section: 'explorer', prefix: p },
    };
  },

  // --- Maske <-> CIDR ---
  mask() {
    const p = rnd(8, 30);
    const { full, rest, octet, dotted } = maskBreakdown(p);
    return {
      html: `Welche <b>Subnetzmaske</b> (dezimal, z. B. 255.255.0.0) entspricht <b>/${p}</b>?`,
      placeholder: 'z. B. 255.255.255.0',
      isCorrect: (a) => {
        const r = parseIpCidrAnswer(a);
        return !!r && r.prefix === null && r.ip === maskFromPrefix(p);
      },
      answerText: dotted,
      hint: `${p} Einsen von links: ${full} volle Oktette (255), dann ${rest} ${plural(rest, 'Bit', 'Bits')} im nächsten Oktett.`,
      explain:
        `${p} = ${full} × 8 + ${rest} → ${full} volle ${plural(full, 'Oktett', 'Oktette')} (255)` +
        (rest ? `, dann ${rest} ${plural(rest, 'Bit', 'Bits')} = ${octet}` : '') +
        `, Rest 0 → <b>${dotted}</b>.`,
      view: { section: 'explorer', prefix: p },
    };
  },
  cidrFromMask() {
    const p = rnd(8, 30);
    const { full, rest, octet, dotted } = maskBreakdown(p);
    return {
      html: `Welche <b>CIDR-Notation</b> entspricht der Subnetzmaske <b>${dotted}</b>?`,
      placeholder: 'z. B. /24',
      isCorrect: (a) => parseCidrAnswer(a) === p,
      answerText: `/${p}`,
      hint: `Zähle die vollen 255-Oktette (je 8 Bits) und übersetze das angefangene Oktett: 128 → 1, 192 → 2, 224 → 3, 240 → 4, 248 → 5, 252 → 6, 254 → 7.`,
      explain:
        `${full} × 255 = ${full * 8} Bits` +
        (rest ? ` + ${octet} = ${bitsOfOctet(octet)} ${plural(rest, 'Bit', 'Bits')}` : '') +
        ` → <b>/${p}</b>.`,
      view: { section: 'explorer', prefix: p },
    };
  },

  // --- Netzadressen ---
  nthSubnet() {
    const parent = rnd(8, 24);
    const k = rnd(1, 4);
    const n = 2 ** k;
    const child = parent + k;
    const net = networkOf(parseIp(pick(BASES)), parent);
    const idx = rnd(1, n);
    const step = blockSize(child);
    const addr = net + (idx - 1) * step;
    return {
      html:
        `Das Netz <b>${toDotted(net)}/${parent}</b> wird in <b>${n}</b> gleich große Teilnetze geteilt. ` +
        `Wie lautet die <b>Netzadresse des ${idx}. Teilnetzes</b>?`,
      placeholder: 'z. B. 10.0.0.0',
      isCorrect: (a) => ipMatches(a, addr, child),
      answerText: `${toDotted(addr)}/${child}`,
      hint: `Die Teilnetze sind /${child}. Jedes umfasst ${fmt(step)} Adressen – in Punktschreibweise ein Schritt von ${toDotted(step)}.`,
      explain:
        `${n} = 2<sup>${k}</sup> → /${child}. Blockgröße 2<sup>${32 - child}</sup> = ${fmt(step)} Adressen (Schritt ${toDotted(step)}). ` +
        `${idx}. Teilnetz = ${toDotted(net)} + ${idx - 1} × Schritt = <b>${toDotted(addr)}/${child}</b>.`,
      view: { section: 'split', ip: toDotted(net), parent, child },
    };
  },
  networkOf() {
    const p = rnd(16, 30);
    const ip = randomHostIp();
    const net = networkOf(ip, p);
    const maskDotted = toDotted(maskFromPrefix(p));
    const { full, rest, octet } = maskBreakdown(p);
    let explain;
    if (rest === 0) {
      explain =
        `Maske ${maskDotted} endet an einer Oktettgrenze: die ersten ${full} Oktette bleiben, der Rest wird 0 → ` +
        `<b>${toDotted(net)}/${p}</b>.`;
    } else {
      const block = 256 - octet;
      const ipOct = toDotted(ip).split('.')[full];
      const netOct = Math.floor(ipOct / block) * block;
      explain =
        `Maske ${maskDotted}. Das ${full + 1}. Oktett ist das interessante (Maske ${octet}): Blockgröße 256 − ${octet} = ${block}. ` +
        `${ipOct} liegt im Block ${netOct}–${netOct + block - 1}, die Oktette danach werden 0 → <b>${toDotted(net)}/${p}</b>.`;
    }
    return {
      html: `In welchem Netz liegt die Adresse <b>${toDotted(ip)}/${p}</b>? Gesucht ist die <b>Netzadresse</b>.`,
      placeholder: 'z. B. 192.168.1.0',
      isCorrect: (a) => ipMatches(a, net, p),
      answerText: `${toDotted(net)}/${p}`,
      hint: `Maske: ${maskDotted}. Nur das Oktett, in dem die Maske weder 255 noch 0 ist, muss gerechnet werden.`,
      explain,
      view: { section: 'explorer', prefix: p, ip: toDotted(ip) },
    };
  },
};

const TYPE_GROUPS = {
  split: ['splitCidr', 'splitCount', 'borrowBits'],
  size: ['hosts', 'fitHosts'],
  mask: ['mask', 'cidrFromMask'],
  addr: ['nthSubnet', 'networkOf'],
};

const q = {
  text: $('#q-text'),
  form: $('#q-form'),
  input: $('#q-answer'),
  submit: $('#q-submit'),
  hint: $('#q-hint'),
  hintBtn: $('#q-hint-btn'),
  showBtn: $('#q-show'),
  skipBtn: $('#q-skip'),
  feedback: $('#q-feedback'),
  score: $('#q-score'),
  checkboxes: Array.from(document.querySelectorAll('.type-list input[type="checkbox"]')),
};
const quiz = { current: null, answered: false, total: 0, correct: 0, streak: 0 };

function enabledTypes() {
  let types = q.checkboxes.filter((c) => c.checked).flatMap((c) => TYPE_GROUPS[c.dataset.group]);
  if (types.length === 0) {
    // Nichts ausgewählt: Standardgruppe wieder einschalten
    const fallback = q.checkboxes.find((c) => c.dataset.group === 'split');
    fallback.checked = true;
    types = TYPE_GROUPS.split;
  }
  return types;
}

function updateScore() {
  const pct = quiz.total ? ` (${Math.round((quiz.correct / quiz.total) * 100)} %)` : '';
  q.score.textContent = `Richtig: ${quiz.correct} / ${quiz.total}${pct} · Serie: ${quiz.streak}`;
}

function newQuestion() {
  const type = pick(enabledTypes());
  quiz.current = GENERATORS[type]();
  quiz.answered = false;

  q.text.innerHTML = quiz.current.html;
  q.input.value = '';
  q.input.placeholder = quiz.current.placeholder;
  q.input.disabled = false;
  q.feedback.className = 'feedback';
  q.feedback.innerHTML = '';
  q.hint.classList.remove('show');
  q.hint.innerHTML = quiz.current.hint;
  q.hintBtn.disabled = false;
  q.submit.textContent = 'Prüfen';
  q.input.focus();
}

function checkAnswer() {
  const cur = quiz.current;
  const val = q.input.value.trim();
  if (!val) {
    q.input.focus();
    return;
  }
  const ok = cur.isCorrect(val);
  quiz.total++;
  if (ok) {
    quiz.correct++;
    quiz.streak++;
  } else {
    quiz.streak = 0;
  }

  q.feedback.className = `feedback ${ok ? 'ok' : 'bad'}`;
  q.feedback.innerHTML =
    `<div class="verdict">${ok ? '✓ Richtig!' : `✗ Leider falsch. Richtige Antwort: ${cur.answerText}`}</div>` +
    `<div class="explain">${cur.explain}</div>`;

  quiz.answered = true;
  q.input.disabled = true;
  q.hintBtn.disabled = true;
  q.hint.classList.remove('show');
  q.submit.textContent = 'Nächste Aufgabe';
  q.submit.focus();
  updateScore();
}

function showInSlider() {
  const v = quiz.current.view;
  if (v.section === 'explorer') {
    ex.prefix.value = v.prefix;
    if (v.ip) ex.ip.value = v.ip;
    updateExplorer();
  } else {
    setSplit(v);
  }
  const sec = $(v.section === 'explorer' ? '#explorer' : '#split');
  sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
  sec.classList.remove('flash');
  void sec.offsetWidth; // Animation neu starten
  sec.classList.add('flash');
}

q.form.addEventListener('submit', (e) => {
  e.preventDefault();
  if (quiz.answered) newQuestion();
  else checkAnswer();
});
q.hintBtn.addEventListener('click', () => q.hint.classList.toggle('show'));
q.showBtn.addEventListener('click', showInSlider);
q.skipBtn.addEventListener('click', newQuestion);
q.checkboxes.forEach((c) => c.addEventListener('change', () => {
  if (!quiz.answered) newQuestion();
}));

/* ------------------------------------------------------------------
 * Start
 * ------------------------------------------------------------------ */
updateExplorer();
updateSplit();
updateScore();
newQuestion();
