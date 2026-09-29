const els = {
  video: document.querySelector('#video'),
  roi: document.querySelector('#roi'),
  cameraWrap: document.querySelector('#cameraWrap'),

  settingsBtn: document.querySelector('#settingsBtn'),
  settingsModal: document.querySelector('#settingsModal'),
  settingsCloseBtn: document.querySelector('#settingsCloseBtn'),
  settingsRunningNote: document.querySelector('#settingsRunningNote'),
  scanTarget: document.querySelector('#scanTarget'),
  readModeField: document.querySelector('#readModeField'),
  qrModeHint: document.querySelector('#qrModeHint'),
  outputSettingsSection: document.querySelector('#outputSettingsSection'),
  numericAdvancedSettings: document.querySelector('#numericAdvancedSettings'),

  readMode: document.querySelector('#readMode'),
  autoTriggerField: document.querySelector('#autoTriggerField'),
  autoTrigger: document.querySelector('#autoTrigger'),
  intervalField: document.querySelector('#intervalField'),
  intervalSec: document.querySelector('#intervalSec'),

  outputMode: document.querySelector('#outputMode'),
  tableSettings: document.querySelector('#tableSettings'),
  fixedColumns: document.querySelector('#fixedColumns'),
  columnCountField: document.querySelector('#columnCountField'),
  columnCount: document.querySelector('#columnCount'),
  columnHeaderMode: document.querySelector('#columnHeaderMode'),
  columnHeadersField: document.querySelector('#columnHeadersField'),
  columnHeaders: document.querySelector('#columnHeaders'),
  fixedRows: document.querySelector('#fixedRows'),
  rowCountField: document.querySelector('#rowCountField'),
  rowCount: document.querySelector('#rowCount'),
  rowHeaderMode: document.querySelector('#rowHeaderMode'),
  rowHeadersField: document.querySelector('#rowHeadersField'),
  rowHeaders: document.querySelector('#rowHeaders'),
  cornerHeaderField: document.querySelector('#cornerHeaderField'),
  cornerHeader: document.querySelector('#cornerHeader'),
  fillRuleHint: document.querySelector('#fillRuleHint'),

  changeSensitivity: document.querySelector('#changeSensitivity'),
  decimalPlaces: document.querySelector('#decimalPlaces'),
  unit: document.querySelector('#unit'),

  roiAdjustBtn: document.querySelector('#roiAdjustBtn'),
  roiAdjustPanel: document.querySelector('#roiAdjustPanel'),
  roiAdjustCloseBtn: document.querySelector('#roiAdjustCloseBtn'),
  roiX: document.querySelector('#roiX'),
  roiY: document.querySelector('#roiY'),
  roiW: document.querySelector('#roiW'),
  roiH: document.querySelector('#roiH'),
  roiXLabel: document.querySelector('#roiXLabel'),
  roiYLabel: document.querySelector('#roiYLabel'),
  roiWLabel: document.querySelector('#roiWLabel'),
  roiHLabel: document.querySelector('#roiHLabel'),

  cameraBtn: document.querySelector('#cameraBtn'),
  readBtn: document.querySelector('#readBtn'),
  undoBtn: document.querySelector('#undoBtn'),
  shareBtn: document.querySelector('#shareBtn'),
  saveBtn: document.querySelector('#saveBtn'),

  currentReading: document.querySelector('.current-reading'),
  currentValue: document.querySelector('#currentValue'),
  currentUnit: document.querySelector('#currentUnit'),
  targetLine: document.querySelector('#targetLine'),
  status: document.querySelector('#status'),
  confidence: document.querySelector('#confidence'),
  recordCount: document.querySelector('#recordCount'),
  lastTime: document.querySelector('#lastTime'),
  exportSummary: document.querySelector('#exportSummary'),

  recentTable: document.querySelector('#recentTable'),
  recentBody: document.querySelector('#recentBody'),
  recentHeadTime: document.querySelector('#recentHeadTime'),
  recentHeadCol: document.querySelector('#recentHeadCol'),
  recentHeadRow: document.querySelector('#recentHeadRow'),
  recentHeadValue: document.querySelector('#recentHeadValue'),
  tablePreviewDetails: document.querySelector('#tablePreviewDetails'),
  previewTable: document.querySelector('#previewTable'),

  ocrMiniText: document.querySelector('#ocrMiniText'),
  ocrProgress: document.querySelector('#ocrProgress'),
  ocrText: document.querySelector('#ocrText'),
  debugCanvas: document.querySelector('#debugCanvas'),

  captureCanvas: document.querySelector('#captureCanvas'),
  ocrCanvas: document.querySelector('#ocrCanvas'),
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

const measurements = [];
const qrRecords = [];
const qrSeen = new Set();

const changeCanvas = document.createElement('canvas');
changeCanvas.width = 96;
changeCanvas.height = 32;

const qrCanvas = document.createElement('canvas');
qrCanvas.width = 640;
qrCanvas.height = 480;
let qrScanBusy = false;
let lastQrDetected = '';

function setStatus(text) {
  els.status.textContent = text;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function parseList(value) {
  return String(value || '')
    .split(/[,\t\r\n]+/)
    .map(item => item.trim())
    .filter(Boolean);
}

function nowIsoLocal() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function timeOnly(timestamp) {
  return timestamp ? timestamp.slice(11) : '--:--:--';
}

function isQrMode() {
  return els.scanTarget.value === 'qr';
}

function readConfig() {
  if (els.outputMode.value === 'simple') {
    return { mode: 'simple' };
  }

  const fixedColumns = els.fixedColumns.checked;
  const fixedRows = els.fixedRows.checked;

  return {
    mode: 'table',
    fixedColumns,
    columnCount: fixedColumns
      ? clampInt(els.columnCount.value, 1, 200, 3)
      : null,
    columnHeaderMode: els.columnHeaderMode.value,
    columnHeaders: parseList(els.columnHeaders.value),

    fixedRows,
    rowCount: fixedRows
      ? clampInt(els.rowCount.value, 1, 1000, 3)
      : null,
    rowHeaderMode: els.rowHeaderMode.value,
    rowHeaders: parseList(els.rowHeaders.value),

    cornerHeader: els.cornerHeader.value.trim(),
  };
}

function getColumnLabel(index, cfg = readConfig()) {
  if (cfg.mode !== 'table' || cfg.columnHeaderMode === 'none') {
    return String(index + 1);
  }

  if (cfg.columnHeaderMode === 'custom') {
    return cfg.columnHeaders[index] || String(index + 1);
  }

  return String(index + 1);
}

function getRowLabel(index, cfg = readConfig()) {
  if (cfg.mode !== 'table' || cfg.rowHeaderMode === 'none') {
    return String(index + 1);
  }

  if (cfg.rowHeaderMode === 'custom') {
    return cfg.rowHeaders[index] || String(index + 1);
  }

  return String(index + 1);
}

function positionForIndex(index, cfg = readConfig()) {
  if (cfg.mode === 'simple') {
    return { row: 0, col: index };
  }

  if (cfg.fixedColumns) {
    return {
      row: Math.floor(index / cfg.columnCount),
      col: index % cfg.columnCount,
    };
  }

  if (cfg.fixedRows) {
    return {
      row: index % cfg.rowCount,
      col: Math.floor(index / cfg.rowCount),
    };
  }

  return { row: 0, col: index };
}

function tableCapacity(cfg = readConfig()) {
  if (
    cfg.mode === 'table' &&
    cfg.fixedColumns &&
    cfg.fixedRows
  ) {
    return cfg.columnCount * cfg.rowCount;
  }

  return Infinity;
}

function outputIsFull(cfg = readConfig()) {
  if (isQrMode()) return false;
  return measurements.length >= tableCapacity(cfg);
}

function updateOutputSettingsUi() {
  const cfg = readConfig();
  const tableMode = cfg.mode === 'table';

  els.tableSettings.classList.toggle('hidden-field', !tableMode);

  if (tableMode) {
    els.columnCountField.classList.toggle(
      'hidden-field',
      !cfg.fixedColumns
    );

    els.rowCountField.classList.toggle(
      'hidden-field',
      !cfg.fixedRows
    );

    els.columnHeadersField.classList.toggle(
      'hidden-field',
      cfg.columnHeaderMode !== 'custom'
    );

    els.rowHeadersField.classList.toggle(
      'hidden-field',
      cfg.rowHeaderMode !== 'custom'
    );

    const showCorner =
      cfg.columnHeaderMode !== 'none' &&
      cfg.rowHeaderMode !== 'none';

    els.cornerHeaderField.classList.toggle(
      'hidden-field',
      !showCorner
    );

    if (cfg.fixedColumns && cfg.fixedRows) {
      els.fillRuleHint.textContent =
        `左→右に記録し、${cfg.columnCount}列ごとに次の行へ進みます。最大 ${cfg.columnCount}列 × ${cfg.rowCount}行です。`;
    } else if (cfg.fixedColumns) {
      els.fillRuleHint.textContent =
        `左→右に記録し、${cfg.columnCount}列ごとに次の行へ進みます。行数は自動で増えます。`;
    } else if (cfg.fixedRows) {
      els.fillRuleHint.textContent =
        `上→下に記録し、${cfg.rowCount}行ごとに次の列へ進みます。列数は自動で増えます。`;
    } else {
      els.fillRuleHint.textContent =
        '列数・行数とも未指定の場合は、1行のまま右方向へ追加します。';
    }
  }

  updateDerivedUi();
}

function updateReadSettingsUi() {
  const qr = isQrMode();
  const auto = els.readMode.value === 'auto';

  els.readModeField.classList.toggle('hidden-field', qr);
  els.autoTriggerField.classList.toggle(
    'hidden-field',
    qr || !auto
  );
  els.intervalField.classList.toggle(
    'hidden-field',
    qr || !auto || els.autoTrigger.value !== 'interval'
  );
  els.qrModeHint.classList.toggle('hidden-field', !qr);
  els.outputSettingsSection.classList.toggle('hidden-field', qr);
  els.numericAdvancedSettings.classList.toggle('hidden-field', qr);
  els.tablePreviewDetails.classList.toggle('hidden-field', qr);

  els.cameraWrap.classList.toggle('qr-mode', qr);
  els.currentReading.classList.toggle('qr-reading', qr);
  els.currentUnit.classList.toggle('hidden-field', qr);

  if (qr) {
    els.roiAdjustPanel.classList.add('hidden-field');
  }

  updateDerivedUi();
  updatePrimaryButtons();
}

function setSettingsLocked(locked) {
  els.settingsRunningNote.classList.toggle(
    'hidden-field',
    !locked
  );

  [
    els.scanTarget,
    els.readMode,
    els.autoTrigger,
    els.intervalSec,
    els.outputMode,
    els.fixedColumns,
    els.columnCount,
    els.columnHeaderMode,
    els.columnHeaders,
    els.fixedRows,
    els.rowCount,
    els.rowHeaderMode,
    els.rowHeaders,
    els.cornerHeader,
    els.changeSensitivity,
    els.decimalPlaces,
    els.unit,
  ].forEach(control => {
    control.disabled = locked;
  });
}

function updateRoi() {
  const x = Number(els.roiX.value);
  const y = Number(els.roiY.value);
  const w = Number(els.roiW.value);
  const h = Number(els.roiH.value);

  els.roi.style.left = `${x}%`;
  els.roi.style.top = `${y}%`;
  els.roi.style.width = `${w}%`;
  els.roi.style.height = `${h}%`;

  els.roiXLabel.textContent = `${x}%`;
  els.roiYLabel.textContent = `${y}%`;
  els.roiWLabel.textContent = `${w}%`;
  els.roiHLabel.textContent = `${h}%`;

  if (
    stream &&
    loggingActive &&
    els.readMode.value === 'auto' &&
    els.autoTrigger.value === 'change'
  ) {
    try {
      changeBaseline = captureFingerprint();
      changeCandidate = null;
      changeCandidateCount = 0;
    } catch (err) {
      console.debug('baseline reset skipped', err);
    }
  }
}

function currentTargetDescription() {
  const cfg = readConfig();
  const position = positionForIndex(measurements.length, cfg);

  if (cfg.mode === 'simple') {
    return `1行 / ${position.col + 1}列`;
  }

  if (outputIsFull(cfg)) {
    return '表入力完了';
  }

  const rowLabel = getRowLabel(position.row, cfg);
  const colLabel = getColumnLabel(position.col, cfg);

  return `${position.row + 1}行(${rowLabel}) / ${position.col + 1}列(${colLabel})`;
}

function updatePrimaryButtons() {
  const connected = Boolean(stream);
  const auto = els.readMode.value === 'auto';
  const full = outputIsFull();

  els.cameraBtn.textContent =
    connected ? 'カメラ切断' : 'カメラ接続';

  if (!auto) {
    els.readBtn.textContent = '撮影';
    els.readBtn.classList.add('primary');
    els.readBtn.classList.remove('danger');
    els.readBtn.disabled =
      !connected || isReading || full;
    return;
  }

  els.readBtn.textContent =
    loggingActive
      ? '自動読み取り停止'
      : '自動読み取り開始';

  els.readBtn.classList.toggle(
    'danger',
    loggingActive
  );

  els.readBtn.classList.toggle(
    'primary',
    !loggingActive
  );

  els.readBtn.disabled =
    !connected || (!loggingActive && full);
}

function updateRecentLog() {
  els.recentBody.textContent = '';
  const cfg = readConfig();

  const recent = measurements
    .map((record, index) => ({
      record,
      index,
      pos: positionForIndex(index, cfg),
    }))
    .slice(-5)
    .reverse();

  for (const item of recent) {
    const tr = document.createElement('tr');

    const values = [
      timeOnly(item.record.timestamp),
      item.pos.col + 1,
      item.pos.row + 1,
      item.record.value,
    ];

    for (const value of values) {
      const td = document.createElement('td');
      td.textContent = String(value);
      tr.append(td);
    }

    els.recentBody.append(tr);
  }

  for (let i = recent.length; i < 5; i++) {
    const tr = document.createElement('tr');
    tr.className = 'empty-row';
    const td = document.createElement('td');
    td.colSpan = 4;
    td.textContent = '—';
    tr.append(td);
    els.recentBody.append(tr);
  }
}

function computeExportSize(cfg = readConfig()) {
  if (cfg.mode !== 'table') {
    return { rows: 1, cols: Math.max(measurements.length, 1) };
  }

  let maxRow = -1;
  let maxCol = -1;

  measurements.forEach((_, index) => {
    const pos = positionForIndex(index, cfg);
    maxRow = Math.max(maxRow, pos.row);
    maxCol = Math.max(maxCol, pos.col);
  });

  const customRows =
    cfg.rowHeaderMode === 'custom'
      ? cfg.rowHeaders.length
      : 0;

  const customCols =
    cfg.columnHeaderMode === 'custom'
      ? cfg.columnHeaders.length
      : 0;

  const rows = cfg.fixedRows
    ? Math.max(cfg.rowCount, maxRow + 1, 1)
    : Math.max(maxRow + 1, customRows, 1);

  const cols = cfg.fixedColumns
    ? Math.max(cfg.columnCount, maxCol + 1, 1)
    : Math.max(maxCol + 1, customCols, 1);

  return { rows, cols };
}

function buildTableMatrix(cfg = readConfig()) {
  const { rows, cols } = computeExportSize(cfg);
  const matrix = Array.from(
    { length: rows },
    () => Array(cols).fill('')
  );

  measurements.forEach((record, index) => {
    const pos = positionForIndex(index, cfg);

    while (matrix.length <= pos.row) {
      matrix.push(Array(cols).fill(''));
    }

    while (matrix[pos.row].length <= pos.col) {
      matrix[pos.row].push('');
    }

    matrix[pos.row][pos.col] = record.value;
  });

  return matrix;
}

function renderTablePreview() {
  els.previewTable.textContent = '';
  const cfg = readConfig();

  if (cfg.mode === 'simple') {
    const tbody = document.createElement('tbody');
    const tr = document.createElement('tr');

    const count = Math.max(measurements.length + 1, 1);

    for (let i = 0; i < count; i++) {
      const td = document.createElement('td');
      td.textContent = measurements[i]?.value ?? '';

      if (i === measurements.length) {
        td.classList.add('active-cell');
      }

      tr.append(td);
    }

    tbody.append(tr);
    els.previewTable.append(tbody);
    return;
  }

  const matrix = buildTableMatrix(cfg);
  const { rows, cols } = computeExportSize(cfg);

  if (cfg.columnHeaderMode !== 'none') {
    const thead = document.createElement('thead');
    const tr = document.createElement('tr');

    if (cfg.rowHeaderMode !== 'none') {
      const th = document.createElement('th');
      th.textContent = cfg.cornerHeader || '';
      tr.append(th);
    }

    for (let c = 0; c < cols; c++) {
      const th = document.createElement('th');
      th.textContent = getColumnLabel(c, cfg);
      tr.append(th);
    }

    thead.append(tr);
    els.previewTable.append(thead);
  }

  const next = positionForIndex(measurements.length, cfg);
  const tbody = document.createElement('tbody');

  for (let r = 0; r < rows; r++) {
    const tr = document.createElement('tr');

    if (cfg.rowHeaderMode !== 'none') {
      const td = document.createElement('td');
      td.textContent = getRowLabel(r, cfg);
      td.classList.add('row-header');
      tr.append(td);
    }

    for (let c = 0; c < cols; c++) {
      const td = document.createElement('td');
      td.textContent = matrix[r]?.[c] ?? '';

      if (
        !outputIsFull(cfg) &&
        r === next.row &&
        c === next.col
      ) {
        td.classList.add('active-cell');
      }

      tr.append(td);
    }

    tbody.append(tr);
  }

  els.previewTable.append(tbody);
}

function updateDerivedUi() {
  els.recordCount.textContent = String(measurements.length);

  const last = measurements[measurements.length - 1];
  els.lastTime.textContent = last
    ? timeOnly(last.timestamp)
    : '--:--:--';

  els.targetLine.textContent = currentTargetDescription();

  const cfg = readConfig();
  els.exportSummary.textContent =
    measurements.length === 0
      ? '記録なし'
      : `${measurements.length}件 / ${cfg.mode === 'simple' ? '1行CSV' : '表形式'}`;

  const hasData = measurements.length > 0;
  els.undoBtn.disabled = !hasData;
  els.shareBtn.disabled = !hasData;
  els.saveBtn.disabled = !hasData;

  updateRecentLog();
  renderTablePreview();
  updatePrimaryButtons();
}

function saveMeasurement(value, timestamp, status, confidence) {
  const cfg = readConfig();

  if (outputIsFull(cfg)) {
    setStatus('表入力完了');
    return false;
  }

  measurements.push({
    value,
    timestamp,
    status,
    confidence,
  });

  updateDerivedUi();

  if (outputIsFull(cfg) && loggingActive) {
    stopAutoReading(true);
    setStatus('測定完了');
  }

  return true;
}

function undoLast() {
  if (!measurements.length) return;

  measurements.pop();

  if (
    loggingActive &&
    els.autoTrigger.value === 'change' &&
    stream
  ) {
    try {
      changeBaseline = captureFingerprint();
      changeCandidate = null;
      changeCandidateCount = 0;
    } catch (err) {
      console.debug('baseline reset skipped', err);
    }
  }

  setStatus('1つ戻しました');
  updateDerivedUi();
}

function openSettings() {
  setSettingsLocked(loggingActive);
  els.settingsModal.classList.remove('hidden-field');
}

function closeSettings() {
  els.settingsModal.classList.add('hidden-field');
  updateDerivedUi();
}

function toggleRoiPanel(show) {
  const shouldShow =
    typeof show === 'boolean'
      ? show
      : els.roiAdjustPanel.classList.contains('hidden-field');

  els.roiAdjustPanel.classList.toggle(
    'hidden-field',
    !shouldShow
  );
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    alert('このブラウザではカメラを利用できません。iPhone SafariをHTTPSで開いてください。');
    return;
  }

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

      if (caps.focusMode?.includes('continuous')) {
        advanced.focusMode = 'continuous';
      }

      if (caps.exposureMode?.includes('continuous')) {
        advanced.exposureMode = 'continuous';
      }

      if (Object.keys(advanced).length) {
        await track.applyConstraints({ advanced: [advanced] });
      }
    } catch (err) {
      console.debug('camera fine-tuning unavailable', err);
    }

    els.video.srcObject = stream;
    await els.video.play();
    await sleep(350);

    setStatus('カメラ接続済み');
    updatePrimaryButtons();
  } catch (err) {
    console.error(err);
    stream = null;
    setStatus('カメラ起動失敗');
    alert('カメラを起動できません。Safariのカメラ権限とHTTPS接続を確認してください。');
  }
}

function stopCamera() {
  if (loggingActive) {
    stopAutoReading(false);
  }

  if (stream) {
    stream.getTracks().forEach(track => track.stop());
  }

  stream = null;
  els.video.srcObject = null;
  setStatus('カメラ未接続');
  updatePrimaryButtons();
}

async function toggleCamera() {
  if (stream) {
    stopCamera();
  } else {
    await startCamera();
  }
}

async function ensureWorker() {
  if (worker) return worker;

  setStatus('OCR初期化中');

  worker = await Tesseract.createWorker('eng', 1, {
    logger: message => {
      if (typeof message.progress === 'number') {
        els.ocrProgress.value = message.progress;
      }

      if (message.status) {
        els.ocrText.textContent = `OCR: ${message.status}`;
      }
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

  if (!vw || !vh) {
    throw new Error('video not ready');
  }

  const wrap = els.cameraWrap.getBoundingClientRect();
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
  const rx = Number(els.roiX.value) / 100;
  const ry = Number(els.roiY.value) / 100;

  const left = Math.max(0, Math.min(1 - rw, rx - rw / 2));
  const top = Math.max(0, Math.min(1 - rh, ry - rh / 2));

  return {
    sx: visibleX + visibleW * left,
    sy: visibleY + visibleH * top,
    sw: visibleW * rw,
    sh: visibleH * rh,
  };
}

function captureRoi() {
  const rect = getRoiSourceRect();
  const outW = 1100;
  const outH = Math.max(
    220,
    Math.round(outW * rect.sh / rect.sw)
  );

  els.captureCanvas.width = outW;
  els.captureCanvas.height = outH;

  const ctx = els.captureCanvas.getContext(
    '2d',
    { willReadFrequently: true }
  );

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  ctx.drawImage(
    els.video,
    rect.sx,
    rect.sy,
    rect.sw,
    rect.sh,
    0,
    0,
    outW,
    outH
  );

  return els.captureCanvas;
}

function captureFingerprint() {
  const rect = getRoiSourceRect();

  const ctx = changeCanvas.getContext(
    '2d',
    { willReadFrequently: true }
  );

  ctx.drawImage(
    els.video,
    rect.sx,
    rect.sy,
    rect.sw,
    rect.sh,
    0,
    0,
    changeCanvas.width,
    changeCanvas.height
  );

  const data = ctx.getImageData(
    0,
    0,
    changeCanvas.width,
    changeCanvas.height
  ).data;

  const gray = new Float32Array(
    changeCanvas.width * changeCanvas.height
  );

  let sum = 0;

  for (let p = 0, i = 0; p < gray.length; p++, i += 4) {
    const g =
      0.299 * data[i] +
      0.587 * data[i + 1] +
      0.114 * data[i + 2];

    gray[p] = g;
    sum += g;
  }

  const mean = sum / gray.length;

  for (let i = 0; i < gray.length; i++) {
    gray[i] -= mean;
  }

  return gray;
}

function fingerprintDistance(a, b) {
  if (!a || !b || a.length !== b.length) return 1;

  let sum = 0;

  for (let i = 0; i < a.length; i++) {
    sum += Math.abs(a[i] - b[i]);
  }

  return sum / (a.length * 255);
}

function changeThresholds() {
  switch (els.changeSensitivity.value) {
    case 'high':
      return { changed: 0.0028, stable: 0.0030 };
    case 'low':
      return { changed: 0.0110, stable: 0.0070 };
    default:
      return { changed: 0.0055, stable: 0.0045 };
  }
}

async function checkDisplayChange() {
  if (
    !loggingActive ||
    els.autoTrigger.value !== 'change' ||
    isReading ||
    changeCheckBusy ||
    outputIsFull()
  ) {
    return;
  }

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

    if (
      !changeCandidate ||
      fingerprintDistance(fp, changeCandidate) > thresholds.stable
    ) {
      changeCandidate = fp;
      changeCandidateCount = 1;
      return;
    }

    changeCandidateCount += 1;
    changeCandidate = fp;

    if (changeCandidateCount >= 2) {
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
  const sctx = srcCanvas.getContext(
    '2d',
    { willReadFrequently: true }
  );

  const src = sctx.getImageData(0, 0, w, h);
  const gray = new Uint8Array(w * h);

  for (let p = 0, i = 0; p < gray.length; p++, i += 4) {
    gray[p] = Math.round(
      0.299 * src.data[i] +
      0.587 * src.data[i + 1] +
      0.114 * src.data[i + 2]
    );
  }

  const iw = w + 1;
  const integral = new Uint32Array((w + 1) * (h + 1));

  for (let y = 1; y <= h; y++) {
    let rowSum = 0;

    for (let x = 1; x <= w; x++) {
      rowSum += gray[(y - 1) * w + (x - 1)];
      integral[y * iw + x] =
        integral[(y - 1) * iw + x] + rowSum;
    }
  }

  const out = new Uint8ClampedArray(w * h * 4);
  const binary = new Uint8Array(w * h);
  const radius = Math.max(
    14,
    Math.round(Math.min(w, h) * 0.06)
  );

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

      const area =
        (x1 - x0 + 1) *
        (y1 - y0 + 1);

      const mean =
        (D - B - C + A) / area;

      const isInk =
        gray[y * w + x] < mean - offset;

      binary[y * w + x] = isInk ? 1 : 0;

      const oi = (y * w + x) * 4;
      const value = isInk ? 0 : 255;

      out[oi] = value;
      out[oi + 1] = value;
      out[oi + 2] = value;
      out[oi + 3] = 255;
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
      if (binary[row + x]) {
        columnCounts[x] += 1;
      }
    }
  }

  const minDigitInk = Math.max(
    5,
    Math.floor((yBottom - yTop) * 0.08)
  );

  const rawGroups = [];
  let start = -1;

  for (let x = 0; x <= w; x++) {
    const active =
      x < w &&
      columnCounts[x] >= minDigitInk;

    if (active && start < 0) {
      start = x;
    }

    if (!active && start >= 0) {
      rawGroups.push([start, x - 1]);
      start = -1;
    }
  }

  const gapJoin = Math.max(
    6,
    Math.floor(h * 0.035)
  );

  const merged = [];

  for (const group of rawGroups) {
    const prev = merged[merged.length - 1];

    if (
      prev &&
      group[0] - prev[1] <= gapJoin
    ) {
      prev[1] = group[1];
    } else {
      merged.push([...group]);
    }
  }

  const digitGroups = merged.filter(
    group =>
      (group[1] - group[0] + 1) >=
      Math.max(8, h * 0.035)
  );

  const visited = new Uint8Array(w * h);
  const candidates = [];
  const y0 = Math.floor(h * 0.52);

  for (let y = y0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;

      if (!binary[idx] || visited[idx]) {
        continue;
      }

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

        area += 1;
        minX = Math.min(minX, cx);
        maxX = Math.max(maxX, cx);
        minY = Math.min(minY, cy);
        maxY = Math.max(maxY, cy);

        const neighbors = [
          cur - 1,
          cur + 1,
          cur - w,
          cur + w
        ];

        for (const n of neighbors) {
          if (
            n < 0 ||
            n >= w * h ||
            visited[n] ||
            !binary[n]
          ) {
            continue;
          }

          const ny = Math.floor(n / w);
          const nx = n - ny * w;

          if (
            Math.abs(nx - cx) +
            Math.abs(ny - cy) !== 1
          ) {
            continue;
          }

          visited[n] = 1;
          stack.push(n);
        }
      }

      const bw = maxX - minX + 1;
      const bh = maxY - minY + 1;
      const density = area / (bw * bh);
      const relH = bh / h;
      const relW = bw / w;

      if (
        area >= Math.max(15, w * h * 0.00008) &&
        relH >= 0.025 &&
        relH <= 0.18 &&
        relW >= 0.008 &&
        relW <= 0.10 &&
        density >= 0.25 &&
        maxY / h >= 0.60
      ) {
        candidates.push({
          x: (minX + maxX) / 2,
          y: (minY + maxY) / 2,
          area,
          density
        });
      }
    }
  }

  candidates.sort(
    (a, b) =>
      (b.area * b.density) -
      (a.area * a.density)
  );

  const decimal = candidates.find(
    candidate =>
      candidate.x > w * 0.08 &&
      candidate.x < w * 0.92
  ) || null;

  return { decimal, digitGroups };
}

function renderOcrCanvas(pre) {
  const pad = Math.round(
    Math.max(30, pre.h * 0.12)
  );

  els.ocrCanvas.width =
    pre.w + pad * 2;

  els.ocrCanvas.height =
    pre.h + pad * 2;

  const ctx = els.ocrCanvas.getContext(
    '2d',
    { willReadFrequently: true }
  );

  ctx.fillStyle = '#fff';
  ctx.fillRect(
    0,
    0,
    els.ocrCanvas.width,
    els.ocrCanvas.height
  );

  ctx.putImageData(
    new ImageData(
      pre.out,
      pre.w,
      pre.h
    ),
    pad,
    pad
  );

  els.debugCanvas.width =
    els.ocrCanvas.width;

  els.debugCanvas.height =
    els.ocrCanvas.height;

  els.debugCanvas
    .getContext('2d')
    .drawImage(
      els.ocrCanvas,
      0,
      0
    );

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
    cleaned =
      cleaned.slice(0, firstDot + 1) +
      cleaned
        .slice(firstDot + 1)
        .replace(/\./g, '');
  }

  if (
    !/^\d{1,6}(\.\d{1,3})?$/
      .test(cleaned)
  ) {
    return null;
  }

  const value = Number(cleaned);

  if (
    !Number.isFinite(value) ||
    value < 0 ||
    value > 999999
  ) {
    return null;
  }

  return {
    value,
    normalized: cleaned
  };
}

function formatFixedDecimals(digits, places) {
  const safeDigits =
    digits.replace(/\D/g, '');

  if (!safeDigits) return null;

  if (places === 0) {
    return String(Number(safeDigits));
  }

  const padded =
    safeDigits.padStart(
      places + 1,
      '0'
    );

  const splitAt =
    padded.length - places;

  const whole =
    padded
      .slice(0, splitAt)
      .replace(/^0+(?=\d)/, '') || '0';

  return `${whole}.${padded.slice(splitAt)}`;
}

function applyDecimalPolicy(parsed, rawText, decimalInfo) {
  const policy = els.decimalPlaces.value;
  const rawDigits =
    normalizeText(rawText)
      .replace(/\D/g, '');

  const parsedDigits =
    parsed?.normalized
      ?.replace(/\D/g, '') || '';

  const digits =
    rawDigits || parsedDigits;

  if (policy !== 'auto') {
    const places = Number(policy);
    const normalized =
      formatFixedDecimals(digits, places);

    if (!normalized) return null;

    const value = Number(normalized);

    if (!Number.isFinite(value)) {
      return null;
    }

    return {
      value,
      normalized,
      decimalFixed: true
    };
  }

  if (
    parsed?.normalized
      ?.includes('.')
  ) {
    return parsed;
  }

  if (
    !decimalInfo?.decimal ||
    !digits ||
    digits.length < 2
  ) {
    return parsed;
  }

  const groups =
    decimalInfo.digitGroups;

  const dotX =
    decimalInfo.decimal.x;

  let insertAt = -1;

  if (
    groups.length ===
    digits.length
  ) {
    const centers =
      groups.map(
        group =>
          (group[0] +
           group[1]) / 2
      );

    insertAt =
      centers.filter(
        x => x < dotX
      ).length;
  }

  if (
    insertAt <= 0 ||
    insertAt >=
      digits.length
  ) {
    return parsed;
  }

  const recovered =
    `${digits.slice(0, insertAt)}.${digits.slice(insertAt)}`;

  return {
    value: Number(recovered),
    normalized: recovered,
    decimalRecovered: true
  };
}

async function recognizeCanvas(canvas, decimalInfo) {
  const activeWorker =
    await ensureWorker();

  const result =
    await activeWorker.recognize(canvas);

  const raw =
    result?.data?.text ?? '';

  const confidence =
    Number(
      result?.data?.confidence ?? 0
    );

  let parsed =
    parseValue(raw);

  parsed =
    applyDecimalPolicy(
      parsed,
      raw,
      decimalInfo
    );

  if (!parsed) {
    const digitsOnly =
      normalizeText(raw)
        .replace(/\D/g, '');

    if (
      /^\d{1,7}$/
        .test(digitsOnly)
    ) {
      parsed =
        applyDecimalPolicy(
          {
            value:
              Number(digitsOnly),
            normalized:
              digitsOnly
          },
          raw,
          decimalInfo
        );
    }
  }

  return {
    raw,
    confidence,
    parsed
  };
}

async function readOnce({ save = true } = {}) {
  if (
    isReading ||
    outputIsFull()
  ) {
    return;
  }

  isReading = true;
  updatePrimaryButtons();

  try {
    setStatus('読み取り中');

    const src =
      captureRoi();

    const pre =
      buildAdaptiveBinary(src);

    const decimalInfo =
      findDecimalAndDigitGroups(
        pre.binary,
        pre.w,
        pre.h
      );

    const ocrCanvas =
      renderOcrCanvas(pre);

    const result =
      await recognizeCanvas(
        ocrCanvas,
        decimalInfo
      );

    const timestamp =
      nowIsoLocal();

    els.confidence.textContent =
      `${Math.round(result.confidence)}%`;

    const decimalInfoText =
      result.parsed?.decimalFixed
        ? ` / 小数${els.decimalPlaces.value}桁固定`
        : result.parsed?.decimalRecovered
          ? ' / 小数点補正'
          : '';

    els.ocrText.textContent =
      `OCR原文: ${JSON.stringify(result.raw.trim())}${decimalInfoText}`;

    if (result.parsed) {
      const value =
        result.parsed.normalized;

      els.currentValue.textContent =
        value;

      els.ocrMiniText.textContent =
        value;

      const lowConfidence =
        result.confidence < 35;

      const resultStatus =
        lowConfidence
          ? 'LOW_CONFIDENCE'
          : 'OK';

      setStatus(
        loggingActive
          ? `${resultStatus} / 自動中`
          : resultStatus
      );

      if (save) {
        saveMeasurement(
          value,
          timestamp,
          resultStatus,
          result.confidence
        );
      }
    } else {
      els.ocrMiniText.textContent =
        'ERROR';

      setStatus(
        loggingActive
          ? 'OCR_ERROR / 自動中'
          : 'OCR_ERROR'
      );
    }
  } catch (err) {
    console.error(err);
    els.ocrMiniText.textContent =
      'ERROR';
    setStatus('ERROR');
  } finally {
    isReading = false;
    els.ocrProgress.value = 0;
    updatePrimaryButtons();
  }
}

async function startAutoReading() {
  if (
    loggingActive ||
    !stream ||
    outputIsFull()
  ) {
    return;
  }

  loggingActive = true;
  setSettingsLocked(true);
  closeSettings();
  updatePrimaryButtons();

  if (
    els.autoTrigger.value ===
    'change'
  ) {
    changeBaseline =
      captureFingerprint();

    changeCandidate = null;
    changeCandidateCount = 0;

    setStatus(
      '画面変化を監視中'
    );

    await readOnce({
      save: true
    });

    if (!loggingActive) return;

    timer = setInterval(
      checkDisplayChange,
      120
    );
  } else {
    const sec =
      Number(
        els.intervalSec.value
      );

    setStatus(
      `${sec}秒間隔で自動読み取り`
    );

    await readOnce({
      save: true
    });

    if (!loggingActive) return;

    timer = setInterval(
      () =>
        readOnce({
          save: true
        }),
      sec * 1000
    );
  }
}

function stopAutoReading(
  preserveStatus = false
) {
  if (timer) {
    clearInterval(timer);
  }

  timer = null;
  loggingActive = false;
  changeBaseline = null;
  changeCandidate = null;
  changeCandidateCount = 0;

  setSettingsLocked(false);

  if (!preserveStatus) {
    setStatus('自動読み取り停止');
  }

  updatePrimaryButtons();
  updateDerivedUi();
}

async function handleReadButton() {
  if (els.readMode.value === 'manual') {
    await readOnce({ save: true });
    return;
  }

  if (loggingActive) {
    stopAutoReading(false);
  } else {
    await startAutoReading();
  }
}

function csvEscape(value) {
  const s =
    String(value ?? '');

  return /[",\r\n]/.test(s)
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

function buildCsvText() {
  const cfg = readConfig();

  if (cfg.mode === 'simple') {
    return (
      '\uFEFF' +
      measurements
        .map(record =>
          csvEscape(record.value)
        )
        .join(',')
    );
  }

  const matrix =
    buildTableMatrix(cfg);

  const { rows, cols } =
    computeExportSize(cfg);

  const lines = [];

  if (
    cfg.columnHeaderMode !==
    'none'
  ) {
    const header = [];

    if (
      cfg.rowHeaderMode !==
      'none'
    ) {
      header.push(
        cfg.cornerHeader || ''
      );
    }

    for (
      let c = 0;
      c < cols;
      c++
    ) {
      header.push(
        getColumnLabel(c, cfg)
      );
    }

    lines.push(
      header
        .map(csvEscape)
        .join(',')
    );
  }

  for (
    let r = 0;
    r < rows;
    r++
  ) {
    const row = [];

    if (
      cfg.rowHeaderMode !==
      'none'
    ) {
      row.push(
        getRowLabel(r, cfg)
      );
    }

    for (
      let c = 0;
      c < cols;
      c++
    ) {
      row.push(
        matrix[r]?.[c] ?? ''
      );
    }

    lines.push(
      row
        .map(csvEscape)
        .join(',')
    );
  }

  return (
    '\uFEFF' +
    lines.join('\r\n')
  );
}

function makeCsvFile() {
  const csv =
    buildCsvText();

  const d = new Date();
  const pad =
    n =>
      String(n).padStart(
        2,
        '0'
      );

  const filename =
    `swt-log-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.csv`;

  const blob =
    new Blob(
      [csv],
      {
        type:
          'text/csv;charset=utf-8'
      }
    );

  return {
    csv,
    blob,
    filename
  };
}

function downloadCsv() {
  if (!measurements.length) return;

  const {
    blob,
    filename
  } = makeCsvFile();

  const url =
    URL.createObjectURL(blob);

  const a =
    document.createElement('a');

  a.download = filename;
  a.href = url;

  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(
    () =>
      URL.revokeObjectURL(url),
    1000
  );

  setStatus(
    'CSVを保存しました'
  );
}

async function shareCsv() {
  if (!measurements.length) return;

  const {
    blob,
    filename
  } = makeCsvFile();

  try {
    const file =
      new File(
        [blob],
        filename,
        {
          type:
            'text/csv;charset=utf-8'
        }
      );

    if (
      navigator.share &&
      (
        !navigator.canShare ||
        navigator.canShare({
          files: [file]
        })
      )
    ) {
      await navigator.share({
        files: [file],
        title: 'SWT測定データ',
        text:
          'SWT Loggerで作成したCSVです。'
      });

      setStatus('共有しました');
      return;
    }
  } catch (err) {
    if (
      err?.name ===
      'AbortError'
    ) {
      setStatus(
        '共有をキャンセル'
      );

      return;
    }

    console.error(
      'share failed',
      err
    );
  }

  downloadCsv();
}

const outputControls = [
  els.outputMode,
  els.fixedColumns,
  els.columnCount,
  els.columnHeaderMode,
  els.columnHeaders,
  els.fixedRows,
  els.rowCount,
  els.rowHeaderMode,
  els.rowHeaders,
  els.cornerHeader,
];

outputControls.forEach(
  control => {
    control.addEventListener(
      'input',
      updateOutputSettingsUi
    );

    control.addEventListener(
      'change',
      updateOutputSettingsUi
    );
  }
);

els.readMode.addEventListener(
  'change',
  updateReadSettingsUi
);

els.autoTrigger.addEventListener(
  'change',
  updateReadSettingsUi
);

els.unit.addEventListener(
  'change',
  () => {
    els.currentUnit.textContent =
      els.unit.value;
  }
);

[
  els.roiX,
  els.roiY,
  els.roiW,
  els.roiH
].forEach(control => {
  control.addEventListener(
    'input',
    updateRoi
  );
});

els.settingsBtn.addEventListener(
  'click',
  openSettings
);

els.settingsCloseBtn.addEventListener(
  'click',
  closeSettings
);

els.settingsModal.addEventListener(
  'click',
  event => {
    if (
      event.target ===
      els.settingsModal
    ) {
      closeSettings();
    }
  }
);

document.addEventListener(
  'keydown',
  event => {
    if (
      event.key ===
      'Escape' &&
      !els.settingsModal
        .classList
        .contains('hidden-field')
    ) {
      closeSettings();
    }
  }
);

els.roiAdjustBtn.addEventListener(
  'click',
  () =>
    toggleRoiPanel()
);

els.roiAdjustCloseBtn.addEventListener(
  'click',
  () =>
    toggleRoiPanel(false)
);

els.cameraBtn.addEventListener(
  'click',
  toggleCamera
);

els.readBtn.addEventListener(
  'click',
  handleReadButton
);

els.undoBtn.addEventListener(
  'click',
  undoLast
);

els.shareBtn.addEventListener(
  'click',
  shareCsv
);

els.saveBtn.addEventListener(
  'click',
  downloadCsv
);

window.addEventListener(
  'beforeunload',
  () => {
    if (timer) {
      clearInterval(timer);
    }

    if (stream) {
      stream
        .getTracks()
        .forEach(
          track =>
            track.stop()
        );
    }

    if (worker) {
      worker.terminate();
    }
  }
);

updateRoi();
updateOutputSettingsUi();
updateReadSettingsUi();
updateDerivedUi();
