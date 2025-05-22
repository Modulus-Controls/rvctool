// ===== UI handles ====================================================
const connectBtn  = document.getElementById('connectBtn');
const saveLogBtn  = document.getElementById('saveLogBtn');
const eraseBtn    = document.getElementById('eraseBtn');
const deviceList  = document.querySelector('.flex-1.overflow-y-auto');
const statusLed   = document.querySelector('.w-3.h-3');
const statusText  = statusLed?.nextElementSibling;

// global pkt/s badge
let globalRateEl = document.getElementById('globalRate');
if (!globalRateEl) {
  globalRateEl           = document.createElement('span');
  globalRateEl.id        = 'globalRate';
  globalRateEl.className = 'ml-4 text-xs text-gray-400';
  statusText?.parentNode.appendChild(globalRateEl);
}

// ===== runtime state =================================================
let serial;
let connected          = false;
let debug              = false;
let dgnNameMap         = {};             // PGN/DGN → name
let devTypeMap         = {};             // default-SA → device type
let devices            = {};             // state per source
let logEntries         = [];
let pinnedDGNs         = new Set();
let pinnedDevices      = new Set();

// rolling 5-s rate window
const RATE_WINDOW = 6;
let globalHist = Array(RATE_WINDOW).fill(0);

// DM_RV PGN/DGN (masked src byte already stripped)
const DM_RV_DGN = '0FECA';

// ===== helpers: status LED ===========================================
function updateStatus(on) {
  statusLed.classList.toggle('bg-green-400', on);
  statusLed.classList.toggle('bg-red-500',  !on);
  statusText.textContent = on ? 'Connected' : 'Disconnected';
}

// ===== ensure device DOM block ======================================
function ensureDevice(src) {
  if (devices[src]?.wrapEl) return devices[src].wrapEl;

  const details = document.createElement('details');
  details.dataset.src = src;
  details.className   = 'bg-gray-800 rounded-lg p-3 mt-2';

  const summary = document.createElement('summary');
  summary.className =
    'cursor-pointer text-base font-medium flex justify-between items-center';

  // ---- left: pin + label + (optional) type -------------------------
  const left = document.createElement('span');
  left.className = 'flex items-center';

  const pinBtn = document.createElement('button');
  pinBtn.className =
    'pin-device text-xl mr-2 focus:outline-none select-none opacity-30';
  pinBtn.textContent = '📌';
  pinBtn.title       = 'Pin device';

  pinBtn.addEventListener('click', e => {
    e.stopPropagation();
    const pinned = pinnedDevices.has(src);
    if (pinned) pinnedDevices.delete(src);
    else        pinnedDevices.add(src);
    pinBtn.classList.toggle('opacity-30', !pinned);
    sortDevices();
  });

  const labelSpan = document.createElement('span');
  labelSpan.textContent = `Src 0x${src}`;

  // placeholder for device type
  const typeSpan = document.createElement('span');
  typeSpan.className = 'device-type ml-2 text-xs text-gray-300';

  left.append(pinBtn, labelSpan, typeSpan);
  summary.appendChild(left);

  // ---- right: total pkts -------------------------------------------
  const totalSpan = document.createElement('span');
  totalSpan.className = 'src-total text-sm text-gray-400';
  totalSpan.textContent = '0 pkts';
  summary.appendChild(totalSpan);

  details.appendChild(summary);

  const wrap = document.createElement('div');
  wrap.className = 'mt-3 space-y-2 pl-4';
  details.appendChild(wrap);

  deviceList.appendChild(details);
  sortDevices();

  devices[src] = {
    total: 0,
    dgnCounts: {},
    wrapEl: wrap,
    typeEl: typeSpan,
    type: null
  };
  return wrap;
}

// reorder device list: pins first, then src hex
function sortDevices() {
  [...deviceList.children].sort((a, b) => {
    const aP = pinnedDevices.has(a.dataset.src);
    const bP = pinnedDevices.has(b.dataset.src);
    if (aP !== bP) return aP ? -1 : 1;
    return parseInt(a.dataset.src, 16) - parseInt(b.dataset.src, 16);
  }).forEach(n => deviceList.appendChild(n));

  // Always update pin icon state for all device pin buttons
  [...deviceList.children].forEach(details => {
    const pinBtn = details.querySelector('.pin-device');
    if (pinBtn) {
      const isPinned = pinnedDevices.has(details.dataset.src);
      pinBtn.classList.toggle('opacity-30', !isPinned);
      pinBtn.setAttribute('aria-pressed', isPinned);
    }
  });
}

// ===== ensure DGN row ===============================================
function ensureDgnRow(wrap, dgn) {
  let row = wrap.querySelector(`.dgn-row[data-dgn="${dgn}"]`);
  if (row) return row;

  row                 = document.createElement('div');
  row.dataset.dgn     = dgn;
  row.dataset.lastCnt = 0;
  row.className       = 'dgn-row flex justify-between items-center';

  const pin = document.createElement('button');
  pin.className =
    'pin-dgn text-xl mr-2 focus:outline-none select-none';
  pin.textContent = '📌';
  pin.title       = 'Pin DGN';

  pin.addEventListener('click', e => {
    e.stopPropagation();
    if (pinnedDGNs.has(dgn)) pinnedDGNs.delete(dgn);
    else                     pinnedDGNs.add(dgn);
    sortRows(wrap); // This will update all pin icons
  });

  const name = document.createElement('span');
  name.className =
    'dgn-name flex-1 mr-2 overflow-hidden text-ellipsis whitespace-nowrap';
  name.textContent = dgnNameMap[dgn] ?? dgn;

  const rate = document.createElement('span');
  rate.className = 'dgn-rate text-xs w-14 text-right mr-2 text-gray-400';
  rate.textContent = '0/s';

  const count = document.createElement('span');
  count.className =
    'dgn-count bg-gray-700 text-sm rounded-full px-3 py-1';
  count.textContent = '0';

  row.append(pin, name, rate, count);
  wrap.appendChild(row);
  sortRows(wrap);
  return row;
}

// sort rows: pinned first, then by descending count
function sortRows(wrap) {
  const rows = [...wrap.children];
  rows.sort((a, b) => {
    const aP = pinnedDGNs.has(a.dataset.dgn);
    const bP = pinnedDGNs.has(b.dataset.dgn);
    if (aP !== bP) return aP ? -1 : 1;
    const cA = +a.querySelector('.dgn-count').textContent;
    const cB = +b.querySelector('.dgn-count').textContent;
    return cB - cA;
  });
  rows.forEach(r => wrap.appendChild(r));

  // Always update pin icon state for all rows
  rows.forEach(r => {
    const pinBtn = r.querySelector('.pin-dgn');
    if (pinBtn) {
      const isPinned = pinnedDGNs.has(r.dataset.dgn);
      pinBtn.classList.toggle('opacity-30', !isPinned);
      pinBtn.setAttribute('aria-pressed', isPinned);
    }
  });
}

// ===== visual helpers ===============================================
function flash(row) {
  row.classList.add('flash-highlight');
  setTimeout(() => {
    row.classList.remove('flash-highlight');
  }, 500); // The highlight stays for 500ms, then fades out
}
function pulse(badge, val) {
  if (+badge.textContent === val) return;
  badge.textContent = val;
  badge.animate(
    [{transform:'scale(1)',   opacity:0.6},
     {transform:'scale(1.15)',opacity:1},
     {transform:'scale(1)',   opacity:1}],
    {duration:200, easing:'ease-out'}
  );
}

// ===== counters per packet ==========================================
function bump(src, dgn) {
  const dev  = devices[src];
  const wrap = dev.wrapEl;
  const row  = ensureDgnRow(wrap, dgn);

  flash(row);
  wrap.parentElement.querySelector('.src-total').textContent =
    `${dev.total} pkts`;
  pulse(row.querySelector('.dgn-count'), dev.dgnCounts[dgn]);
  sortRows(wrap);
}

// ===== handle one SLCAN line ========================================
// --------------------------------------------------------------------
// Handle ONE SLCAN ASCII frame (“T…”) – with verbose DM_RV debugging
// --------------------------------------------------------------------
function handleCanLine(line) {
  if (!line.startsWith('T') || line.length < 11) return;

  // ---- decode ------------------------------------------------------
  const id       = line.substring(1, 9).toUpperCase();   // 8-char CAN ID
  const src      = id.slice(-2);                         // last byte = SA

  // Original RV-C / J1939 DGN formula
  const dgn      = (
      (parseInt(id[1], 16) & 1).toString(16) + id.substring(2, 6)
    ).toUpperCase();                                     // e.g. 0FECA, 1FD9C …

  const payload  = line.substring(10).toUpperCase();     // data bytes

  // ---- make sure device DOM/object exists *first* -----------------
  ensureDevice(src);
  const dev = devices[src];            // wrapEl & typeEl definitely present

  // ---- book-keeping -----------------------------------------------
  dev.total += 1;
  dev.dgnCounts[dgn] = (dev.dgnCounts[dgn] || 0) + 1;
  bump(src, dgn);                      // flash row, update badges

  // ---- DM_RV detection (accept 0/1/… DP nibble) -------------------
  const isDmRv = dgn.slice(-4) === 'FECA';   // ignore DP nibble
  if (isDmRv && payload.length >= 4) {
    const dsa = payload.slice(2, 4).toUpperCase();       // 2nd data byte
    const typeName = devTypeMap[dsa];

    // Verbose debug output
    console.log(
      `[DM_RV] ID ${id}  Src 0x${src}  DGN ${dgn}  DSA 0x${dsa}  ⇒`,
      typeName ?? '(no map entry)'
    );
    console.log('   dev.typeEl exists?', !!dev.typeEl, dev.typeEl);

    if (typeName && dev.type !== typeName) {
      dev.type = typeName;
      dev.typeEl.textContent = ` – ${typeName}`;
      console.log('   ↳ header updated to', typeName);
    }
  }

  // ---- logging & global rate stats --------------------------------
  logEntries.push({ ts: new Date().toISOString(), id, dgn, src, payload });
  globalHist[globalHist.length - 1] =
    (globalHist[globalHist.length - 1] || 0) + 1;
}



// ===== rate update every second (5-s window) ========================
setInterval(() => {
  globalHist.push(0);
  if (globalHist.length > RATE_WINDOW) globalHist.shift();
  const total = globalHist.reduce((a,b)=>a+b,0);
  globalRateEl.textContent =
    `${(total/RATE_WINDOW).toFixed(2)} pkts/s`;

  deviceList.querySelectorAll('.dgn-row').forEach(row => {
    const dgn = row.dataset.dgn;
    const src = row.closest('details').dataset.src;
    const now = devices[src]?.dgnCounts[dgn] || 0;
    row._hist = row._hist || [];
    row._hist.push(now);
    if (row._hist.length > RATE_WINDOW) row._hist.shift();
    const diff = now - row._hist[0];
    const rate = diff / (row._hist.length-1 || 1);
    row.querySelector('.dgn-rate').textContent =
      `${rate.toFixed(2)}/s`;
  });
}, 1000);

// ===== CSV download =================================================
function downloadCsv() {
  const header = 'Timestamp,ID,DGN,Src,Payload\n';
  const rows   = logEntries
    .map(e => `${e.ts},${e.id},${e.dgn},${e.src},${e.payload}`)
    .join('\n');
  const blob = new Blob([header + rows], {type:'text/csv;charset=utf-8;'});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'rvc_log.csv'; a.click();
  URL.revokeObjectURL(url);
}

// ===== serial connect/disconnect ====================================
async function toggleConnection() {
  if (!connected) {
    try {
      await serial.connect(debug);
      serial.readData(handleCanLine, debug);
      connected = true;
      updateStatus(true);
      connectBtn.querySelector('span:last-child').textContent = 'Disconnect';
    } catch (e) { console.error(e); }
  } else {
    try { await serial.disconnect(debug); } catch{}
    connected = false;
    updateStatus(false);
    connectBtn.querySelector('span:last-child').textContent = 'Connect';
  }
}

// ===== init =========================================================
async function init() {
  deviceList.innerHTML = '';
  devices     = {};
  logEntries  = [];
  globalHist  = Array(RATE_WINDOW).fill(0);

  // DGN lookup
  try {
    const res = await fetch('dgns.json');
    const j   = await res.json();
    (j.dgns||[]).forEach(({dgn,name}) =>
      dgnNameMap[dgn.toUpperCase()] = name);
  } catch {}

  // device-type lookup
  /*try {
    const res = await fetch('dsas.json');
    const j   = await res.json();
    Object.assign(devTypeMap, j.types || {});
  } catch {}*/

  try {
    const res = await fetch('dsas.json');
    const j   = await res.json();

    const map = j.types ?? j;           // accept {types:{…}} or flat object
    Object.assign(devTypeMap, map);

    // NEW — debug
    console.log('[dsas] loaded',
                Object.keys(devTypeMap).length, 'entries',
                devTypeMap);
  } catch (e) {
    console.warn('Could not load dsas.json', e);
  }

  serial = await ( /Mobi|Android/i.test(navigator.userAgent)
      ? import('./serial-mobile.js') : import('./serial.js') );

  connectBtn.addEventListener('click', toggleConnection);
  eraseBtn  .addEventListener('click', () => {
    deviceList.innerHTML = '';
    devices     = {};
    logEntries  = [];
    globalHist  = Array(RATE_WINDOW).fill(0);
  });
  saveLogBtn.addEventListener('click', downloadCsv);

  updateStatus(false);
}
document.addEventListener('DOMContentLoaded', init);
