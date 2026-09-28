const els = {
  video: document.querySelector('#video'),
  roi: document.querySelector('#roi'),
  startCameraBtn: document.querySelector('#startCameraBtn'),
  flipBtn: document.querySelector('#flipBtn'),
  intervalSec: document.querySelector('#intervalSec'),
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
  recordCount: document.querySelector('#recordCount'),
  lastTime: document.querySelector('#lastTime'),
  ocrProgress: document.querySelector('#ocrProgress'),
  ocrText: document.querySelector('#ocrText'),
  csvBtn: document.querySelector('#csvBtn'),
  logBody: document.querySelector('#logBody'),
  captureCanvas: document.querySelector('#captureCanvas'),
  ocrCanvas: document.querySelector('#ocrCanvas'),
};

let stream = null;
let worker = null;
let timer = null;
let isReading = false;
const records = [];

function setStatus(text) { els.status.textContent = text; }
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
[els.roiW, els.roiH, els.roiY].forEach(x => x.addEventListener('input', updateRoi));
els.unit.addEventListener('change', () => els.currentUnit.textContent = els.unit.value);

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
    els.video.srcObject = stream;
    await els.video.play();
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
    tessedit_pageseg_mode: '7',
    preserve_interword_spaces: '0'
  });
  els.ocrProgress.value = 0;
  return worker;
}

function drawRoiToCanvas() {
  const v = els.video;
  const vw = v.videoWidth;
  const vh = v.videoHeight;
  if (!vw || !vh) throw new Error('video not ready');

  const wrap = document.querySelector('#cameraWrap').getBoundingClientRect();
  const shownAspect = wrap.width / wrap.height;
  const videoAspect = vw / vh;

  let visibleX = 0, visibleY = 0, visibleW = vw, visibleH = vh;
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
  const rx = 0.5;

  const sx = visibleX + visibleW * (rx - rw / 2);
  const sy = visibleY + visibleH * (ry - rh / 2);
  const sw = visibleW * rw;
  const sh = visibleH * rh;

  const outW = 1200;
  const outH = Math.max(220, Math.round(outW * sh / sw));
  els.captureCanvas.width = outW;
  els.captureCanvas.height = outH;
  const cctx = els.captureCanvas.getContext('2d', { willReadFrequently: true });
  cctx.drawImage(v, sx, sy, sw, sh, 0, 0, outW, outH);

  els.ocrCanvas.width = outW;
  els.ocrCanvas.height = outH;
  const octx = els.ocrCanvas.getContext('2d', { willReadFrequently: true });
  octx.drawImage(els.captureCanvas, 0, 0);
  const img = octx.getImageData(0, 0, outW, outH);
  const data = img.data;
  for (let i = 0; i < data.length; i += 4) {
    const gray = Math.round(0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2]);
    const adjusted = Math.max(0, Math.min(255, (gray - 105) * 2.25 + 105));
    const value = adjusted < 145 ? 0 : 255;
    data[i] = data[i+1] = data[i+2] = value;
  }
  octx.putImageData(img, 0, 0);
  return els.ocrCanvas;
}

function parseValue(text) {
  const cleaned = text
    .replace(/,/g, '.')
    .replace(/[^0-9.]/g, '')
    .replace(/\.{2,}/g, '.');

  const parts = cleaned.split('.');
  const normalized = parts.length > 1 ? `${parts.shift()}.${parts.join('')}` : cleaned;
  if (!/^\d{1,5}(\.\d{1,3})?$/.test(normalized)) return null;
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0 || value > 99999) return null;
  return { value, raw: text.trim(), normalized };
}

async function readOnce({ save = true } = {}) {
  if (isReading) return;
  isReading = true;
  els.singleBtn.disabled = true;
  try {
    setStatus('読み取り中');
    const canvas = drawRoiToCanvas();
    const w = await ensureWorker();
    const result = await w.recognize(canvas);
    const text = result?.data?.text ?? '';
    els.ocrText.textContent = `OCR原文: ${JSON.stringify(text.trim())}`;
    const parsed = parseValue(text);
    const ts = nowIsoLocal();

    if (parsed) {
      els.currentValue.textContent = parsed.normalized;
      setStatus('OK');
      if (save) addRecord(ts, parsed.normalized, 'OK');
    } else {
      setStatus('OCR_ERROR');
      if (save) addRecord(ts, '', 'OCR_ERROR');
    }
  } catch (err) {
    console.error(err);
    setStatus('ERROR');
    if (save) addRecord(nowIsoLocal(), '', 'ERROR');
  } finally {
    isReading = false;
    els.singleBtn.disabled = !stream;
    els.ocrProgress.value = 0;
  }
}

function addRecord(timestamp, value, status) {
  records.push({ timestamp, value, unit: els.unit.value, status });
  els.recordCount.textContent = String(records.length);
  els.lastTime.textContent = timeOnly(timestamp);
  els.csvBtn.disabled = records.length === 0;

  const tr = document.createElement('tr');
  tr.innerHTML = `<td>${timeOnly(timestamp)}</td><td>${value || '—'}</td><td>${status}</td>`;
  els.logBody.prepend(tr);
}

function startLogging() {
  if (timer) return;
  const sec = Number(els.intervalSec.value);
  els.startBtn.disabled = true;
  els.stopBtn.disabled = false;
  els.intervalSec.disabled = true;
  setStatus('連続記録中');
  readOnce();
  timer = setInterval(() => readOnce(), sec * 1000);
}

function stopLogging() {
  if (timer) clearInterval(timer);
  timer = null;
  els.startBtn.disabled = !stream;
  els.stopBtn.disabled = true;
  els.intervalSec.disabled = false;
  setStatus('停止');
}

function csvEscape(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv() {
  const header = ['timestamp','value','unit','status'];
  const rows = [header, ...records.map(r => [r.timestamp, r.value, r.unit, r.status])];
  const csv = '\uFEFF' + rows.map(row => row.map(csvEscape).join(',')).join('\r\n');
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
els.csvBtn.addEventListener('click', downloadCsv);

window.addEventListener('beforeunload', () => {
  if (timer) clearInterval(timer);
  if (stream) stream.getTracks().forEach(t => t.stop());
  if (worker) worker.terminate();
});

updateRoi();
