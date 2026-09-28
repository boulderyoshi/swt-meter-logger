const els = {
  video: document.querySelector('#video'),
  roi: document.querySelector('#roi'),
  startCameraBtn: document.querySelector('#startCameraBtn'),
  flipBtn: document.querySelector('#flipBtn'),
  recordMode: document.querySelector('#recordMode'),
  decimalPlaces: document.querySelector('#decimalPlaces'),
  intervalField: document.querySelector('#intervalField'),
  intervalSec: document.querySelector('#intervalSec'),
  sensitivityField: document.querySelector('#sensitivityField'),
  changeSensitivity: document.querySelector('#changeSensitivity'),
  unit: document.querySelector('#unit'),
  roiW: document.querySelector('#roiW'),
  roiH: document.querySelector('#roiH'),
  roiY: document.querySelector('#roiY'),
  roiWLabel: document.querySelector('#roiWLabel'),
  roiHLabel: document.querySelector('#roiHLabel'),
  roiYLabel: document.querySelector('#roiYLabel'),
  singleBtn: document.querySelector('#singleBtn'),
  startBtn: document.querySelector('#startBtn'),
  stopBtn: document.querySelector('#stopBtn'),
  currentValue: document.querySelector('#currentValue'),
  currentUnit: document.querySelector('#currentUnit'),
  status: document.querySelector('#status'),
  confidence: document.querySelector('#confidence'),
  recordCount: document.querySelector('#recordCount'),
  lastTime: document.querySelector('#lastTime'),
  ocrProgress: document.querySelector('#ocrProgress'),
  ocrText: document.querySelector('#ocrText'),
  noteText: document.querySelector('#noteText'),
  insertTextBtn: document.querySelector('#insertTextBtn'),
  insertBlankBtn: document.querySelector('#insertBlankBtn'),
  csvBtn: document.querySelector('#csvBtn'),
  logBody: document.querySelector('#logBody'),
  captureCanvas: document.querySelector('#captureCanvas'),
  ocrCanvas: document.querySelector('#ocrCanvas'),
  debugCanvas: document.querySelector('#debugCanvas'),
};

let stream = null;
let worker = null;
let timer = null;
let loggingActive = false;
let isReading = false;
let changeCheckBusy = false;
let changeBaseline = null;
let changeCandidate = null;
let changeCandidateCount = 0;
let measurementCount = 0;

const entries = [];
const changeCanvas = document.createElement('canvas');
changeCanvas.width = 96;
changeCanvas.height = 32;

function setStatus(text) { els.status.textContent = text; }
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function nowIsoLocal() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
function timeOnly(ts) { return ts.slice(11); }

function updateRoi() {
  els.roi.style.width = `${els.roiW.value}%`;
  els.roi.style.height = `${els.roiH.value}%`;
  els.roi.style.top = `${els.roiY.value}%`;
  els.roiWLabel.textContent = `${els.roiW.value}%`;
  els.roiHLabel.textContent = `${els.roiH.value}%`;
  els.roiYLabel.textContent = `${els.roiY.value}%`;
}

function updateModeUi() {
  const changeMode = els.recordMode.value === 'change';
  els.intervalField.classList.toggle('hidden-field', changeMode);
  els.sensitivityField.classList.toggle('hidden-field', !changeMode);
  els.startBtn.textContent = changeMode ? '監視開始' : '連続記録開始';
}

function lockMeasurementControls(locked) {
  els.recordMode.disabled = locked;
  els.decimalPlaces.disabled = locked;
  els.intervalSec.disabled = locked;
  els.changeSensitivity.disabled = locked;
  els.unit.disabled = locked;
  els.roiW.disabled = locked;
  els.roiH.disabled = locked;
  els.roiY.disabled = locked;
}

[els.roiW, els.roiH, els.roiY].forEach(x => x.addEventListener('input', updateRoi));
els.unit.addEventListener('change', () => els.currentUnit.textContent = els.unit.value);
els.recordMode.addEventListener('change', updateModeUi);

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    alert('このブラウザではカメラを利用できません。iPhone SafariをHTTPSで開いてください。');
    return;
  }
  if (stream) stream.getTracks().forEach(t => t.stop());

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      }
    });

    const track = stream.getVideoTracks()[0];
    try {
      const caps = track.getCapabilities?.() || {};
      const advanced = {};
      if (caps.focusMode?.includes('continuous')) advanced.focusMode = 'continuous';
      if (caps.exposureMode?.includes('continuous')) advanced.exposureMode = 'continuous';
      if (Object.keys(advanced).length) await track.applyConstraints({ advanced: [advanced] });
    } catch (e) {
      console.debug('camera fine-tuning unavailable', e);
    }

    els.video.srcObject = stream;
    await els.video.play();
    await sleep(350);
    els.singleBtn.disabled = false;
    els.startBtn.disabled = false;
    els.flipBtn.disabled = false;
    setStatus('カメラ準備完了');
  } catch (err) {
    console.error(err);
    setStatus('カメラ起動失敗');
    alert('カメラを起動できません。Safariのカメラ権限とHTTPS接続を確認してください。');
  }
}

async function ensureWorker() {
  if (worker) return worker;
  setStatus('OCR初期化中');
  worker = await Tesseract.createWorker('eng', 1, {
    logger: m => {
      if (typeof m.progress === 'number') els.ocrProgress.value = m.progress;
      if (m.status) els.ocrText.textContent = `OCR: ${m.status}`;
    }
  });
  await worker.setParameters({
    tessedit_char_whitelist: '0123456789.',
    tessedit_pageseg_mode: '8',
    preserve_interword_spaces: '0',
    classify_bln_numeric_mode: '1',
    user_defined_dpi: '300'
  });
  els.ocrProgress.value = 0;
  return worker;
}

function getRoiSourceRect() {
  const v = els.video;
  const vw = v.videoWidth;
  const vh = v.videoHeight;
  if (!vw || !vh) throw new Error('video not ready');

  const wrap = document.querySelector('#cameraWrap').getBoundingClientRect();
  const shownAspect = wrap.width / wrap.height;
  const videoAspect = vw / vh;

  let visibleX = 0;
  let visibleY = 0;
  let visibleW = vw;
  let visibleH = vh;

  if (videoAspect > shownAspect) {
    visibleW = vh * shownAspect;
    visibleX = (vw - visibleW) / 2;
  } else {
    visibleH = vw / shownAspect;
    visibleY = (vh - visibleH) / 2;
  }

  const rw = Number(els.roiW.value) / 100;
  const rh = Number(els.roiH.value) / 100;
  const ry = Number(els.roiY.value) / 100;

  return {
    sx: visibleX + visibleW * (0.5 - rw / 2),
    sy: visibleY + visibleH * (ry - rh / 2),
    sw: visibleW * rw,
    sh: visibleH * rh,
  };
}

function captureRoi() {
  const rect = getRoiSourceRect();
  const outW = 1100;
  const outH = Math.max(220, Math.round(outW * rect.sh / rect.sw));

  els.captureCanvas.width = outW;
  els.captureCanvas.height = outH;

  const ctx = els.captureCanvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(
    els.video,
    rect.sx, rect.sy, rect.sw, rect.sh,
    0, 0, outW, outH
  );
  return els.captureCanvas;
}

function captureFingerprint() {
  const rect = getRoiSourceRect();
  const ctx = changeCanvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(
    els.video,
    rect.sx, rect.sy, rect.sw, rect.sh,
    0, 0, changeCanvas.width, changeCanvas.height
  );

  const data = ctx.getImageData(0, 0, changeCanvas.width, changeCanvas.height).data;
  const gray = new Float32Array(changeCanvas.width * changeCanvas.height);
  let sum = 0;

  for (let p = 0, i = 0; p < gray.length; p++, i += 4) {
    const g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    gray[p] = g;
    sum += g;
  }

  const mean = sum / gray.length;
  for (let i = 0; i < gray.length; i++) gray[i] -= mean;
  return gray;
}

function fingerprintDistance(a, b) {
  if (!a || !b || a.length !== b.length) return 1;
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / (a.length * 255);
}

function changeThresholds() {
  switch (els.changeSensitivity.value) {
    case 'high': return { changed: 0.010, stable: 0.007 };
    case 'low': return { changed: 0.032, stable: 0.014 };
    default: return { changed: 0.018, stable: 0.010 };
  }
}

async function checkDisplayChange() {
  if (!loggingActive || els.recordMode.value !== 'change' || isReading || changeCheckBusy) return;
  changeCheckBusy = true;

  try {
    const fp = captureFingerprint();
    if (!changeBaseline) {
      changeBaseline = fp;
      return;
    }

    const thresholds = changeThresholds();
    const delta = fingerprintDistance(fp, changeBaseline);

    if (delta < thresholds.changed) {
      changeCandidate = null;
      changeCandidateCount = 0;
      return;
    }

    if (!changeCandidate || fingerprintDistance(fp, changeCandidate) > thresholds.stable) {
      changeCandidate = fp;
      changeCandidateCount = 1;
      return;
    }

    changeCandidateCount++;
    changeCandidate = fp;

    if (changeCandidateCount >= 3) {
      changeBaseline = fp;
      changeCandidate = null;
      changeCandidateCount = 0;
      setStatus('表示変化を検出');
      await readOnce({ save: true });
    }
  } catch (err) {
    console.error('change detection error', err);
  } finally {
    changeCheckBusy = false;
  }
}

function buildAdaptiveBinary(srcCanvas) {
  const w = srcCanvas.width;
  const h = srcCanvas.height;
  const sctx = srcCanvas.getContext('2d', { willReadFrequently: true });
  const src = sctx.getImageData(0, 0, w, h);
  const gray = new Uint8Array(w * h);

  for (let p = 0, i = 0; p < gray.length; p++, i += 4) {
    gray[p] = Math.round(0.299 * src.data[i] + 0.587 * src.data[i+1] + 0.114 * src.data[i+2]);
  }

  const iw = w + 1;
  const integral = new Uint32Array((w + 1) * (h + 1));
  for (let y = 1; y <= h; y++) {
    let rowSum = 0;
    for (let x = 1; x <= w; x++) {
      rowSum += gray[(y - 1) * w + (x - 1)];
      integral[y * iw + x] = integral[(y - 1) * iw + x] + rowSum;
    }
  }

  const out = new Uint8ClampedArray(w * h * 4);
  const binary = new Uint8Array(w * h);
  const radius = Math.max(14, Math.round(Math.min(w, h) * 0.06));
  const offset = 9;

  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(h - 1, y + radius);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(w - 1, x + radius);
      const A = integral[y0 * iw + x0];
      const B = integral[y0 * iw + (x1 + 1)];
      const C = integral[(y1 + 1) * iw + x0];
      const D = integral[(y1 + 1) * iw + (x1 + 1)];
      const area = (x1 - x0 + 1) * (y1 - y0 + 1);
      const mean = (D - B - C + A) / area;
      const isInk = gray[y * w + x] < mean - offset;
      binary[y * w + x] = isInk ? 1 : 0;

      const oi = (y * w + x) * 4;
      const v = isInk ? 0 : 255;
      out[oi] = out[oi+1] = out[oi+2] = v;
      out[oi+3] = 255;
    }
  }

  return { w, h, out, binary };
}

function findDecimalAndDigitGroups(binary, w, h) {
  const columnCounts = new Uint16Array(w);
  const yTop = Math.floor(h * 0.08);
  const yBottom = Math.floor(h * 0.92);

  for (let y = yTop; y < yBottom; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      if (binary[row + x]) columnCounts[x]++;
    }
  }

  const minDigitInk = Math.max(5, Math.floor((yBottom - yTop) * 0.08));
  const rawGroups = [];
  let start = -1;
  for (let x = 0; x <= w; x++) {
    const active = x < w && columnCounts[x] >= minDigitInk;
    if (active && start < 0) start = x;
    if (!active && start >= 0) {
      rawGroups.push([start, x - 1]);
      start = -1;
    }
  }

  const gapJoin = Math.max(6, Math.floor(h * 0.035));
  const merged = [];
  for (const g of rawGroups) {
    const prev = merged[merged.length - 1];
    if (prev && g[0] - prev[1] <= gapJoin) prev[1] = g[1];
    else merged.push([...g]);
  }

  const digitGroups = merged.filter(g => (g[1] - g[0] + 1) >= Math.max(8, h * 0.035));

  const visited = new Uint8Array(w * h);
  const candidates = [];
  const y0 = Math.floor(h * 0.52);

  for (let y = y0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (!binary[idx] || visited[idx]) continue;

      const stack = [idx];
      visited[idx] = 1;
      let area = 0;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;

      while (stack.length) {
        const cur = stack.pop();
        const cy = Math.floor(cur / w);
        const cx = cur - cy * w;
        area++;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;

        const neighbors = [cur - 1, cur + 1, cur - w, cur + w];
        for (const n of neighbors) {
          if (n < 0 || n >= w * h || visited[n] || !binary[n]) continue;
          const ny = Math.floor(n / w);
          const nx = n - ny * w;
          if (Math.abs(nx - cx) + Math.abs(ny - cy) !== 1) continue;
          visited[n] = 1;
          stack.push(n);
        }
      }

      const bw = maxX - minX + 1;
      const bh = maxY - minY + 1;
      const boxArea = bw * bh;
      const density = area / boxArea;
      const relH = bh / h;
      const relW = bw / w;

      if (
        area >= Math.max(15, w * h * 0.00008) &&
        relH >= 0.025 && relH <= 0.18 &&
        relW >= 0.008 && relW <= 0.10 &&
        density >= 0.25 &&
        maxY / h >= 0.60
      ) {
        candidates.push({
          x: (minX + maxX) / 2,
          y: (minY + maxY) / 2,
          area,
          density,
          bw,
          bh
        });
      }
    }
  }

  candidates.sort((a, b) => (b.area * b.density) - (a.area * a.density));
  const decimal = candidates.find(c => c.x > w * 0.08 && c.x < w * 0.92) || null;
  return { decimal, digitGroups };
}

function renderOcrCanvas(pre) {
  const pad = Math.round(Math.max(30, pre.h * 0.12));
  els.ocrCanvas.width = pre.w + pad * 2;
  els.ocrCanvas.height = pre.h + pad * 2;

  const ctx = els.ocrCanvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, els.ocrCanvas.width, els.ocrCanvas.height);
  ctx.putImageData(new ImageData(pre.out, pre.w, pre.h), pad, pad);

  els.debugCanvas.width = els.ocrCanvas.width;
  els.debugCanvas.height = els.ocrCanvas.height;
  els.debugCanvas.getContext('2d').drawImage(els.ocrCanvas, 0, 0);
  return els.ocrCanvas;
}

function normalizeText(text) {
  return String(text || '')
    .replace(/,/g, '.')
    .replace(/[Oo]/g, '0')
    .replace(/[^0-9.]/g, '')
    .replace(/\.{2,}/g, '.');
}

function parseValue(text) {
  let cleaned = normalizeText(text);
  if (!cleaned) return null;

  const firstDot = cleaned.indexOf('.');
  if (firstDot >= 0) {
    cleaned = cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '');
  }

  if (!/^\d{1,6}(\.\d{1,3})?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0 || value > 999999) return null;
  return { value, normalized: cleaned };
}

function formatFixedDecimals(digits, places) {
  const safeDigits = digits.replace(/\D/g, '');
  if (!safeDigits) return null;
  if (places === 0) return String(Number(safeDigits));

  const padded = safeDigits.padStart(places + 1, '0');
  const splitAt = padded.length - places;
  const whole = padded.slice(0, splitAt).replace(/^0+(?=\d)/, '') || '0';
  return `${whole}.${padded.slice(splitAt)}`;
}

function applyDecimalPolicy(parsed, rawText, decimalInfo) {
  const policy = els.decimalPlaces.value;
  const rawDigits = normalizeText(rawText).replace(/\D/g, '');
  const parsedDigits = parsed?.normalized?.replace(/\D/g, '') || '';
  const digits = rawDigits || parsedDigits;

  if (policy !== 'auto') {
    const places = Number(policy);
    const normalized = formatFixedDecimals(digits, places);
    if (!normalized) return null;
    const value = Number(normalized);
    if (!Number.isFinite(value)) return null;
    return {
      value,
      normalized,
      decimalRecovered: places > 0 && !normalizeText(rawText).includes('.'),
      decimalFixed: true
    };
  }

  if (parsed?.normalized?.includes('.')) return parsed;
  if (!decimalInfo?.decimal || !digits || digits.length < 2) return parsed;

  const groups = decimalInfo.digitGroups;
  const dotX = decimalInfo.decimal.x;
  let insertAt = -1;

  if (groups.length === digits.length) {
    const centers = groups.map(g => (g[0] + g[1]) / 2);
    insertAt = centers.filter(x => x < dotX).length;
  }

  if (insertAt <= 0 || insertAt >= digits.length) return parsed;

  const recovered = `${digits.slice(0, insertAt)}.${digits.slice(insertAt)}`;
  const value = Number(recovered);
  if (!Number.isFinite(value)) return parsed;
  return { value, normalized: recovered, decimalRecovered: true };
}

async function recognizeCanvas(canvas, decimalInfo) {
  const w = await ensureWorker();
  const result = await w.recognize(canvas);
  const raw = result?.data?.text ?? '';
  const confidence = Number(result?.data?.confidence ?? 0);

  let parsed = parseValue(raw);
  parsed = applyDecimalPolicy(parsed, raw, decimalInfo);

  if (!parsed) {
    const digitsOnly = normalizeText(raw).replace(/\D/g, '');
    if (/^\d{1,7}$/.test(digitsOnly)) {
      parsed = applyDecimalPolicy(
        { value: Number(digitsOnly), normalized: digitsOnly },
        raw,
        decimalInfo
      );
    }
  }

  return { raw, confidence, parsed };
}

async function readOnce({ save = true } = {}) {
  if (isReading) return;
  isReading = true;
  els.singleBtn.disabled = true;

  try {
    setStatus('読み取り中');

    const src = captureRoi();
    const pre = buildAdaptiveBinary(src);
    const decimalInfo = findDecimalAndDigitGroups(pre.binary, pre.w, pre.h);
    const ocrCanvas = renderOcrCanvas(pre);

    const result = await recognizeCanvas(ocrCanvas, decimalInfo);
    const ts = nowIsoLocal();

    els.confidence.textContent = `${Math.round(result.confidence)}%`;
    const decimalInfoText = result.parsed?.decimalFixed
      ? ` / 小数${els.decimalPlaces.value}桁固定`
      : result.parsed?.decimalRecovered
        ? ' / 小数点補正'
        : '';

    els.ocrText.textContent = `OCR原文: ${JSON.stringify(result.raw.trim())}${decimalInfoText}`;

    if (result.parsed) {
      els.currentValue.textContent = result.parsed.normalized;
      const lowConfidence = result.confidence < 35;
      const resultStatus = lowConfidence ? 'LOW_CONFIDENCE' : 'OK';
      setStatus(loggingActive && els.recordMode.value === 'change'
        ? `${resultStatus} / 変化監視中`
        : resultStatus);
      if (save) addMeasurement(ts, result.parsed.normalized, resultStatus);
    } else {
      setStatus(loggingActive && els.recordMode.value === 'change'
        ? 'OCR_ERROR / 変化監視中'
        : 'OCR_ERROR');
      if (save) addMeasurement(ts, '', 'OCR_ERROR');
    }
  } catch (err) {
    console.error(err);
    setStatus('ERROR');
    if (save) addMeasurement(nowIsoLocal(), '', 'ERROR');
  } finally {
    isReading = false;
    els.singleBtn.disabled = !stream;
    els.ocrProgress.value = 0;
  }
}

function renderEntry(entry) {
  const tr = document.createElement('tr');

  if (entry.type === 'measurement') {
    const t1 = document.createElement('td');
    const t2 = document.createElement('td');
    const t3 = document.createElement('td');
    t1.textContent = timeOnly(entry.timestamp);
    t2.textContent = entry.value || '—';
    t3.textContent = entry.status;
    tr.append(t1, t2, t3);
  } else if (entry.type === 'text') {
    tr.className = 'note-row';
    const td = document.createElement('td');
    td.colSpan = 3;
    td.textContent = `文字列: ${entry.text}`;
    tr.append(td);
  } else {
    tr.className = 'blank-row';
    const td = document.createElement('td');
    td.colSpan = 3;
    td.textContent = '（CSV空行）';
    tr.append(td);
  }

  els.logBody.prepend(tr);
}

function refreshCsvState() {
  els.csvBtn.disabled = entries.length === 0;
}

function addMeasurement(timestamp, value, status) {
  const entry = {
    type: 'measurement',
    timestamp,
    value,
    unit: els.unit.value,
    status
  };
  entries.push(entry);
  measurementCount++;
  els.recordCount.textContent = String(measurementCount);
  els.lastTime.textContent = timeOnly(timestamp);
  renderEntry(entry);
  refreshCsvState();
}

function insertTextEntry() {
  const text = els.noteText.value;
  if (!text.trim()) return;
  const entry = { type: 'text', text };
  entries.push(entry);
  renderEntry(entry);
  els.noteText.value = '';
  refreshCsvState();
}

function insertBlankEntry() {
  const entry = { type: 'blank' };
  entries.push(entry);
  renderEntry(entry);
  refreshCsvState();
}

async function startLogging() {
  if (loggingActive || !stream) return;

  loggingActive = true;
  els.startBtn.disabled = true;
  els.stopBtn.disabled = false;
  lockMeasurementControls(true);

  if (els.recordMode.value === 'change') {
    changeBaseline = captureFingerprint();
    changeCandidate = null;
    changeCandidateCount = 0;
    setStatus('表示変化を監視中');

    await readOnce({ save: true });
    timer = setInterval(checkDisplayChange, 250);
  } else {
    const sec = Number(els.intervalSec.value);
    setStatus('連続記録中');
    await readOnce({ save: true });
    timer = setInterval(() => readOnce({ save: true }), sec * 1000);
  }
}

function stopLogging() {
  if (timer) clearInterval(timer);
  timer = null;
  loggingActive = false;
  changeBaseline = null;
  changeCandidate = null;
  changeCandidateCount = 0;
  els.startBtn.disabled = !stream;
  els.stopBtn.disabled = true;
  lockMeasurementControls(false);
  updateModeUi();
  setStatus('停止');
}

function csvEscape(v) {
  const s = String(v ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv() {
  const lines = ['timestamp,value,unit,status'];

  for (const entry of entries) {
    if (entry.type === 'measurement') {
      lines.push([
        entry.timestamp,
        entry.value,
        entry.unit,
        entry.status
      ].map(csvEscape).join(','));
    } else if (entry.type === 'text') {
      lines.push(csvEscape(entry.text));
    } else if (entry.type === 'blank') {
      lines.push('');
    }
  }

  const csv = '\uFEFF' + lines.join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');

  a.download = `swt-log-${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.csv`;
  a.href = url;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

els.startCameraBtn.addEventListener('click', startCamera);
els.flipBtn.addEventListener('click', startCamera);
els.singleBtn.addEventListener('click', () => readOnce({ save: true }));
els.startBtn.addEventListener('click', startLogging);
els.stopBtn.addEventListener('click', stopLogging);
els.insertTextBtn.addEventListener('click', insertTextEntry);
els.insertBlankBtn.addEventListener('click', insertBlankEntry);
els.csvBtn.addEventListener('click', downloadCsv);

els.noteText.addEventListener('keydown', event => {
  if (event.key === 'Enter') insertTextEntry();
});

window.addEventListener('beforeunload', () => {
  if (timer) clearInterval(timer);
  if (stream) stream.getTracks().forEach(t => t.stop());
  if (worker) worker.terminate();
});

updateRoi();
updateModeUi();
