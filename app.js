const els = {
  video: document.querySelector('#video'),
  cameraWrap: document.querySelector('#cameraWrap'),
  roi: document.querySelector('#roi'),
  testBadge: document.querySelector('#testBadge'),
  ocrMini: document.querySelector('#ocrMini'),
  debugCanvas: document.querySelector('#debugCanvas'),
  ocrMiniText: document.querySelector('#ocrMiniText'),

  menuTabs: [...document.querySelectorAll('.menu-tab')],
  menuPanels: [...document.querySelectorAll('.menu-panel')],
  saveSettingsBtns: [...document.querySelectorAll('.save-settings-btn')],
  closeMenuBtns: [...document.querySelectorAll('.close-menu-btn')],

  numberOptions: document.querySelector('#numberOptions'),
  decimalDigitsField: document.querySelector('#decimalDigitsField'),
  decimalDigits: document.querySelector('#decimalDigits'),

  roiX: document.querySelector('#roiX'),
  roiY: document.querySelector('#roiY'),
  roiW: document.querySelector('#roiW'),
  roiH: document.querySelector('#roiH'),
  roiXLabel: document.querySelector('#roiXLabel'),
  roiYLabel: document.querySelector('#roiYLabel'),
  roiWLabel: document.querySelector('#roiWLabel'),
  roiHLabel: document.querySelector('#roiHLabel'),

  autoOptions: document.querySelector('#autoOptions'),
  timerSecondsField: document.querySelector('#timerSecondsField'),
  timerSeconds: document.querySelector('#timerSeconds'),

  tableOptions: document.querySelector('#tableOptions'),
  useColumns: document.querySelector('#useColumns'),
  columnCount: document.querySelector('#columnCount'),
  useRows: document.querySelector('#useRows'),
  rowCount: document.querySelector('#rowCount'),
  allowGaps: document.querySelector('#allowGaps'),

  stepCamera: document.querySelector('#stepCamera'),
  stepRead: document.querySelector('#stepRead'),
  cameraBtn: document.querySelector('#cameraBtn'),
  readBtn: document.querySelector('#readBtn'),
  testModeBtn: document.querySelector('#testModeBtn'),
  gapActions: document.querySelector('#gapActions'),
  blankBtn: document.querySelector('#blankBtn'),
  nextRowBtn: document.querySelector('#nextRowBtn'),

  currentReadingLabel: document.querySelector('#currentReadingLabel'),
  currentValue: document.querySelector('#currentValue'),
  currentUnit: document.querySelector('#currentUnit'),
  targetLine: document.querySelector('#targetLine'),
  status: document.querySelector('#status'),
  confidence: document.querySelector('#confidence'),
  recordCount: document.querySelector('#recordCount'),

  undoBtn: document.querySelector('#undoBtn'),
  recentBody: document.querySelector('#recentBody'),

  exportSummary: document.querySelector('#exportSummary'),
  shareBtn: document.querySelector('#shareBtn'),
  saveBtn: document.querySelector('#saveBtn'),
  lastTime: document.querySelector('#lastTime'),

  tablePreviewDetails: document.querySelector('#tablePreviewDetails'),
  previewTable: document.querySelector('#previewTable'),

  ocrProgress: document.querySelector('#ocrProgress'),
  ocrText: document.querySelector('#ocrText'),
  captureCanvas: document.querySelector('#captureCanvas'),
  ocrCanvas: document.querySelector('#ocrCanvas'),
};

const SETTINGS_KEY = 'swt-logger-settings-v012';

let stream = null;
let worker = null;
let timer = null;
let readingActive = false;
let isReading = false;
let testMode = false;
let preTestSettings = null;
let openMenuName = null;

let roiProfiles = {
  number: { x: 50, y: 56, w: 62, h: 24 },
  qr: { x: 50, y: 50, w: 58, h: 58 },
};
let activeRoiTarget = 'number';

let changeCheckBusy = false;
let changeBaseline = null;
let changeCandidate = null;
let changeCandidateCount = 0;

const records = [];
const history = [];
const qrSeen = new Set();
let cursor = { row: 0, col: 0 };

const changeCanvas = document.createElement('canvas');
changeCanvas.width = 96;
changeCanvas.height = 32;

const qrCanvas = document.createElement('canvas');
const qrEnhancedCanvas = document.createElement('canvas');
const qrSharpnessCanvas = document.createElement('canvas');
qrSharpnessCanvas.width = 160;
qrSharpnessCanvas.height = 160;

const qrFrameCanvases = [
  document.createElement('canvas'),
  document.createElement('canvas'),
  document.createElement('canvas'),
];
const qrFrameScores = [0, 0, 0];

let qrFrameCursor = 0;
let qrFrameCount = 0;
let qrEnginePromise = null;
let zxingReadyPromise = null;
let qrScanBusy = false;
let qrMissCount = 0;
let qrLoopHandle = null;
let qrLoopUsesVideoCallback = false;
let qrLastScanAt = 0;
let lastQrDetected = '';
let successAudioContext = null;

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

function nowIsoLocal() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function timeOnly(timestamp) {
  return timestamp ? timestamp.slice(11) : '--:--:--';
}

function checkedValue(name, fallback) {
  return document.querySelector(`input[name="${name}"]:checked`)?.value || fallback;
}

function setCheckedValue(name, value) {
  const inputs = [...document.querySelectorAll(`input[name="${name}"]`)];
  const input = inputs.find(item => item.value === String(value));
  if (input) input.checked = true;
}

function syncActiveRoiToProfile() {
  roiProfiles[activeRoiTarget] = {
    x: clampInt(els.roiX.value, 5, 95, roiProfiles[activeRoiTarget]?.x ?? 50),
    y: clampInt(els.roiY.value, 5, 95, roiProfiles[activeRoiTarget]?.y ?? 50),
    w: clampInt(els.roiW.value, 10, 95, roiProfiles[activeRoiTarget]?.w ?? 58),
    h: clampInt(els.roiH.value, 8, 90, roiProfiles[activeRoiTarget]?.h ?? 58),
  };
}

function loadRoiProfile(target) {
  const fallback =
    target === 'qr'
      ? { x: 50, y: 50, w: 58, h: 58 }
      : { x: 50, y: 56, w: 62, h: 24 };

  const profile = roiProfiles[target] || fallback;

  els.roiX.value = String(profile.x);
  els.roiY.value = String(profile.y);
  els.roiW.value = String(profile.w);
  els.roiH.value = String(profile.h);
}

function getSettings() {
  syncActiveRoiToProfile();

  return {
    scanTarget: checkedValue('scanTarget', 'number'),
    numberMode: checkedValue('numberMode', 'integer'),
    decimalDigits: clampInt(els.decimalDigits.value, 1, 5, 1),

    roiX: clampInt(els.roiX.value, 5, 95, 50),
    roiY: clampInt(els.roiY.value, 5, 95, 56),
    roiW: clampInt(els.roiW.value, 10, 95, 62),
    roiH: clampInt(els.roiH.value, 8, 90, 24),
    roiProfiles: JSON.parse(JSON.stringify(roiProfiles)),

    readMode: checkedValue('readMode', 'auto'),
    autoTrigger: checkedValue('autoTrigger', 'change'),
    timerSeconds: clampInt(els.timerSeconds.value, 1, 300, 5),

    outputMode: checkedValue('outputMode', 'one-line'),
    useColumns: els.useColumns.checked,
    columnCount: Math.max(1, clampInt(els.columnCount.value, 1, 9999, 1)),
    useRows: els.useRows.checked,
    rowCount: Math.max(1, clampInt(els.rowCount.value, 1, 9999, 1)),
    allowGaps: els.allowGaps.checked,
  };
}

function applySettings(settings) {
  if (!settings) return;

  setCheckedValue('scanTarget', settings.scanTarget ?? 'number');
  setCheckedValue('numberMode', settings.numberMode ?? 'integer');
  els.decimalDigits.value = String(clampInt(settings.decimalDigits, 1, 5, 1));

  if (settings.roiProfiles) {
    roiProfiles = {
      number: {
        x: clampInt(settings.roiProfiles.number?.x, 5, 95, 50),
        y: clampInt(settings.roiProfiles.number?.y, 5, 95, 56),
        w: clampInt(settings.roiProfiles.number?.w, 10, 95, 62),
        h: clampInt(settings.roiProfiles.number?.h, 8, 90, 24),
      },
      qr: {
        x: clampInt(settings.roiProfiles.qr?.x, 5, 95, 50),
        y: clampInt(settings.roiProfiles.qr?.y, 5, 95, 50),
        w: clampInt(settings.roiProfiles.qr?.w, 10, 95, 58),
        h: clampInt(settings.roiProfiles.qr?.h, 8, 90, 58),
      },
    };
  } else {
    roiProfiles.number = {
      x: clampInt(settings.roiX, 5, 95, 50),
      y: clampInt(settings.roiY, 5, 95, 56),
      w: clampInt(settings.roiW, 10, 95, 62),
      h: clampInt(settings.roiH, 8, 90, 24),
    };
  }

  activeRoiTarget = settings.scanTarget ?? 'number';
  loadRoiProfile(activeRoiTarget);

  setCheckedValue('readMode', settings.readMode ?? 'auto');
  setCheckedValue('autoTrigger', settings.autoTrigger ?? 'change');
  els.timerSeconds.value = String(clampInt(settings.timerSeconds, 1, 300, 5));

  setCheckedValue('outputMode', settings.outputMode ?? 'one-line');
  els.useColumns.checked = Boolean(settings.useColumns);
  els.columnCount.value = String(Math.max(1, clampInt(settings.columnCount, 1, 9999, 1)));
  els.useRows.checked = Boolean(settings.useRows);
  els.rowCount.value = String(Math.max(1, clampInt(settings.rowCount, 1, 9999, 1)));
  els.allowGaps.checked = Boolean(settings.allowGaps);

  updateAllSettingsUi();
}

function loadSavedSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.warn('settings load failed', err);
    return null;
  }
}

function saveSettings(label = '設定') {
  const settings = getSettings();

  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    setStatus(`${label}を保存しました`);
  } catch (err) {
    console.warn('settings save failed', err);
    setStatus('設定保存に失敗しました');
  }

  return settings;
}

function isQrMode() {
  return getSettings().scanTarget === 'qr';
}

function isTableMode() {
  return getSettings().outputMode === 'table';
}

function updateNestedSettingsUi() {
  const settings = getSettings();

  els.numberOptions.classList.toggle('hidden-field', settings.scanTarget !== 'number');
  els.decimalDigitsField.classList.toggle(
    'hidden-field',
    settings.scanTarget !== 'number' || settings.numberMode !== 'decimal'
  );

  els.autoOptions.classList.toggle('hidden-field', settings.readMode !== 'auto');
  els.timerSecondsField.classList.toggle(
    'hidden-field',
    settings.readMode !== 'auto' || settings.autoTrigger !== 'timer'
  );

  els.tableOptions.classList.toggle('hidden-field', settings.outputMode !== 'table');
  els.columnCount.disabled = settings.outputMode !== 'table' || !settings.useColumns;
  els.rowCount.disabled = settings.outputMode !== 'table' || !settings.useRows;

  els.gapActions.classList.toggle(
    'hidden-field',
    settings.outputMode !== 'table' || !settings.allowGaps
  );

  els.blankBtn.disabled = testMode || outputFull();
  els.nextRowBtn.disabled = testMode || outputFull();

  els.ocrMini.classList.toggle('hidden-field', settings.scanTarget === 'qr');
  els.cameraWrap.classList.toggle('qr-mode', settings.scanTarget === 'qr');

  els.currentReadingLabel.textContent =
    settings.scanTarget === 'qr' ? '管理番号' : '現在値';

  els.currentUnit.textContent = '';

  if (stream && settings.scanTarget === 'qr') {
    void optimizeCameraTrack(stream.getVideoTracks()[0], true);
  }

  updateRoi();
  updatePrimaryUi();
  updateDerivedUi();
}

function updateAllSettingsUi() {
  updateNestedSettingsUi();
}

function openMenu(name) {
  openMenuName = name;

  for (const tab of els.menuTabs) {
    tab.classList.toggle('active', tab.dataset.menu === name);
  }

  for (const panel of els.menuPanels) {
    panel.classList.toggle('hidden-field', panel.dataset.panel !== name);
  }
}

function closeMenu() {
  openMenuName = null;
  for (const tab of els.menuTabs) tab.classList.remove('active');
  for (const panel of els.menuPanels) panel.classList.add('hidden-field');
}

function updateRoi() {
  const settings = getSettings();

  els.roi.style.left = `${settings.roiX}%`;
  els.roi.style.top = `${settings.roiY}%`;
  els.roi.style.width = `${settings.roiW}%`;
  els.roi.style.height = `${settings.roiH}%`;

  els.roiXLabel.textContent = `${settings.roiX}%`;
  els.roiYLabel.textContent = `${settings.roiY}%`;
  els.roiWLabel.textContent = `${settings.roiW}%`;
  els.roiHLabel.textContent = `${settings.roiH}%`;

  if (
    stream &&
    readingActive &&
    settings.scanTarget === 'number' &&
    settings.readMode === 'auto' &&
    settings.autoTrigger === 'change'
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

function outputFull() {
  const settings = getSettings();

  if (
    settings.outputMode !== 'table' ||
    !settings.useRows
  ) {
    return false;
  }

  return cursor.row >= settings.rowCount;
}

function nextCursorPosition(current = cursor) {
  const settings = getSettings();
  const next = { row: current.row, col: current.col };

  if (settings.outputMode !== 'table') {
    return { row: 0, col: current.col + 1 };
  }

  if (settings.useColumns) {
    if (next.col + 1 >= settings.columnCount) {
      next.row += 1;
      next.col = 0;
    } else {
      next.col += 1;
    }
  } else {
    next.col += 1;
  }

  return next;
}

function currentTargetDescription() {
  const settings = getSettings();

  if (settings.outputMode === 'one-line') {
    return `1行 / ${records.length + 1}列`;
  }

  if (outputFull()) {
    return '表入力完了';
  }

  return `${cursor.row + 1}行 / ${cursor.col + 1}列`;
}

function recomputeQrSeen() {
  qrSeen.clear();
  for (const record of records) {
    if (record.source === 'qr') qrSeen.add(record.value);
  }
}

function stopIfOutputFull() {
  if (!outputFull()) return false;

  if (readingActive) stopReading(true);
  setStatus(testMode ? 'テスト: 行数上限' : '指定行数まで完了');
  return true;
}

function pushRecord(value, source, status, confidence) {
  if (testMode) {
    showReadResult(value, source, status, confidence, true);
    return false;
  }

  if (outputFull()) {
    stopIfOutputFull();
    return false;
  }

  const settings = getSettings();
  const prevCursor = { ...cursor };

  const record = {
    id: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`,
    timestamp: nowIsoLocal(),
    value: String(value),
    source,
    status,
    confidence: confidence ?? null,
    row: settings.outputMode === 'one-line' ? 0 : cursor.row,
    col: settings.outputMode === 'one-line' ? records.length : cursor.col,
  };

  records.push(record);
  history.push({
    type: 'record',
    recordId: record.id,
    source,
    value: record.value,
    prevCursor,
  });

  if (source === 'qr') qrSeen.add(record.value);

  cursor =
    settings.outputMode === 'one-line'
      ? { row: 0, col: records.length }
      : nextCursorPosition(cursor);

  showReadResult(record.value, source, status, confidence, false);
  updateDerivedUi();
  stopIfOutputFull();

  return true;
}

function insertBlank() {
  const settings = getSettings();

  if (
    testMode ||
    settings.outputMode !== 'table' ||
    !settings.allowGaps ||
    outputFull()
  ) {
    return;
  }

  const prevCursor = { ...cursor };
  history.push({ type: 'blank', prevCursor });
  cursor = nextCursorPosition(cursor);

  setStatus('空白セルを挿入しました');
  updateDerivedUi();
  stopIfOutputFull();
}

function moveNextRow() {
  const settings = getSettings();

  if (
    testMode ||
    settings.outputMode !== 'table' ||
    !settings.allowGaps ||
    outputFull()
  ) {
    return;
  }

  const prevCursor = { ...cursor };
  history.push({ type: 'newline', prevCursor });

  cursor = {
    row: cursor.row + 1,
    col: 0,
  };

  setStatus('次の行へ移動しました');
  updateDerivedUi();
  stopIfOutputFull();
}

function undoLast() {
  if (testMode || !history.length) return;

  const action = history.pop();

  if (action.type === 'record') {
    const index = records.findIndex(record => record.id === action.recordId);
    if (index >= 0) records.splice(index, 1);
  }

  cursor = { ...action.prevCursor };
  recomputeQrSeen();

  setStatus('1つ戻しました');
  updateDerivedUi();
}

function reflowRecordsForOutput() {
  const values = records.map(record => ({ ...record }));
  records.length = 0;
  history.length = 0;
  cursor = { row: 0, col: 0 };

  for (const old of values) {
    if (outputFull()) break;

    const settings = getSettings();
    const prevCursor = { ...cursor };

    const record = {
      ...old,
      row: settings.outputMode === 'one-line' ? 0 : cursor.row,
      col: settings.outputMode === 'one-line' ? records.length : cursor.col,
    };

    records.push(record);
    history.push({
      type: 'record',
      recordId: record.id,
      source: record.source,
      value: record.value,
      prevCursor,
    });

    cursor =
      settings.outputMode === 'one-line'
        ? { row: 0, col: records.length }
        : nextCursorPosition(cursor);
  }

  recomputeQrSeen();
  updateDerivedUi();
}

function showReadResult(value, source, status, confidence, isTest) {
  els.currentValue.textContent = String(value);

  if (source === 'qr') {
    els.confidence.textContent = 'QR';
  } else {
    els.confidence.textContent =
      confidence === null || confidence === undefined
        ? '--'
        : `${Math.round(confidence)}%`;
  }

  if (isTest) {
    setStatus(`テスト読取: ${value}`);
    return;
  }

  setStatus(status || 'OK');
}

function updateRecentLog() {
  els.recentBody.textContent = '';

  const recent = records.slice(-5).reverse();

  for (const record of recent) {
    const tr = document.createElement('tr');
    const values = [
      timeOnly(record.timestamp),
      record.col + 1,
      record.row + 1,
      record.value,
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

function previewSize() {
  const settings = getSettings();

  if (settings.outputMode === 'one-line') {
    return {
      rows: 1,
      cols: Math.max(records.length + 1, 1),
    };
  }

  const maxRow = Math.max(
    cursor.row,
    ...records.map(record => record.row),
    0
  );

  const maxCol = Math.max(
    cursor.col,
    ...records.map(record => record.col),
    0
  );

  return {
    rows: settings.useRows
      ? settings.rowCount
      : Math.max(maxRow + 1, 1),
    cols: settings.useColumns
      ? settings.columnCount
      : Math.max(maxCol + 1, 1),
  };
}

function buildMatrix() {
  const { rows, cols } = previewSize();
  const matrix = Array.from(
    { length: rows },
    () => Array(cols).fill('')
  );

  for (const record of records) {
    if (record.row < rows && record.col < cols) {
      matrix[record.row][record.col] = record.value;
    }
  }

  return matrix;
}

function renderPreview() {
  els.previewTable.textContent = '';
  const settings = getSettings();

  if (settings.outputMode === 'one-line') {
    const tbody = document.createElement('tbody');
    const tr = document.createElement('tr');

    const count = Math.max(records.length + 1, 1);

    for (let i = 0; i < count; i++) {
      const td = document.createElement('td');
      td.textContent = records[i]?.value ?? '';

      if (i === records.length) td.classList.add('active-cell');
      tr.append(td);
    }

    tbody.append(tr);
    els.previewTable.append(tbody);
    return;
  }

  const matrix = buildMatrix();
  const { rows, cols } = previewSize();

  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  const corner = document.createElement('th');
  corner.textContent = '';
  headerRow.append(corner);

  for (let col = 0; col < cols; col++) {
    const th = document.createElement('th');
    th.textContent = String(col + 1);
    headerRow.append(th);
  }

  thead.append(headerRow);
  els.previewTable.append(thead);

  const tbody = document.createElement('tbody');

  for (let row = 0; row < rows; row++) {
    const tr = document.createElement('tr');
    const rowHeader = document.createElement('td');
    rowHeader.textContent = String(row + 1);
    rowHeader.classList.add('row-header');
    tr.append(rowHeader);

    for (let col = 0; col < cols; col++) {
      const td = document.createElement('td');
      td.textContent = matrix[row]?.[col] ?? '';

      if (
        !outputFull() &&
        row === cursor.row &&
        col === cursor.col
      ) {
        td.classList.add('active-cell');
      }

      tr.append(td);
    }

    tbody.append(tr);
  }

  els.previewTable.append(tbody);
}

function updatePrimaryUi() {
  const settings = getSettings();
  const connected = Boolean(stream);

  els.cameraBtn.textContent =
    connected ? 'カメラ切断' : 'カメラ接続';

  els.stepCamera.classList.toggle('active', !connected);
  els.stepRead.classList.toggle('active', connected && !readingActive);

  if (settings.readMode === 'manual') {
    els.readBtn.textContent =
      settings.scanTarget === 'qr'
        ? 'QR撮影'
        : '撮影';

    els.readBtn.classList.add('primary');
    els.readBtn.classList.remove('danger');
    els.readBtn.disabled =
      !connected || isReading || outputFull();

    return;
  }

  els.readBtn.textContent =
    readingActive
      ? '読み取り停止'
      : '読み取り開始';

  els.readBtn.classList.toggle('danger', readingActive);
  els.readBtn.classList.toggle('primary', !readingActive);
  els.readBtn.disabled =
    !connected || (!readingActive && outputFull());
}

function updateDerivedUi() {
  els.recordCount.textContent = String(records.length);
  els.targetLine.textContent = currentTargetDescription();

  const last = records[records.length - 1];
  els.lastTime.textContent =
    last ? timeOnly(last.timestamp) : '--:--:--';

  els.exportSummary.textContent =
    records.length
      ? `${records.length}件 / ${getSettings().outputMode === 'table' ? '表形式' : '1行'}`
      : '記録なし';

  const hasData = records.length > 0;
  els.undoBtn.disabled = testMode || !history.length;
  els.shareBtn.disabled = !hasData;
  els.saveBtn.disabled = !hasData;

  updateRecentLog();
  renderPreview();
  updatePrimaryUi();
}

function setTestMode(enabled) {
  if (readingActive) stopReading(false);

  if (enabled === testMode) return;

  if (enabled) {
    preTestSettings = getSettings();
    const saved = loadSavedSettings() || getSettings();
    applySettings(saved);
    testMode = true;
    setStatus('テストモード');
  } else {
    testMode = false;
    if (preTestSettings) applySettings(preTestSettings);
    preTestSettings = null;
    setStatus('通常モード');
  }

  els.testModeBtn.classList.toggle('active', testMode);
  els.testModeBtn.textContent =
    testMode ? 'テストモード終了' : 'テストモード';

  els.testBadge.classList.toggle('hidden-field', !testMode);
  els.cameraWrap.classList.toggle('test-mode', testMode);

  updateDerivedUi();
}

async function optimizeCameraTrack(track, qrMode = false) {
  if (!track) return;

  try {
    if ('contentHint' in track) track.contentHint = 'detail';

    const caps = track.getCapabilities?.() || {};
    const advanced = {};

    if (caps.focusMode?.includes('continuous')) {
      advanced.focusMode = 'continuous';
    }

    if (caps.exposureMode?.includes('continuous')) {
      advanced.exposureMode = 'continuous';
    }

    if (caps.whiteBalanceMode?.includes('continuous')) {
      advanced.whiteBalanceMode = 'continuous';
    }

    if (Object.keys(advanced).length) {
      await track.applyConstraints({ advanced: [advanced] });
    }

    if (qrMode) {
      try {
        await track.applyConstraints({
          width: { ideal: 3840 },
          height: { ideal: 2160 },
          frameRate: { ideal: 30 },
        });
      } catch (err) {
        console.debug('high-resolution QR constraints unavailable', err);
      }
    }
  } catch (err) {
    console.debug('camera optimization unavailable', err);
  }
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    alert('iPhone SafariをHTTPSで開き、カメラを許可してください。');
    return;
  }

  try {
    const qrMode = isQrMode();

    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: qrMode ? 3840 : 1920 },
        height: { ideal: qrMode ? 2160 : 1080 },
        frameRate: { ideal: 30 },
      },
    });

    await optimizeCameraTrack(stream.getVideoTracks()[0], qrMode);

    els.video.srcObject = stream;
    await els.video.play();
    await sleep(300);

    setStatus('カメラ接続済み');
    updatePrimaryUi();
  } catch (err) {
    console.error(err);
    stream = null;
    setStatus('カメラ起動失敗');
  }
}

function stopCamera() {
  if (readingActive) stopReading(false);

  if (stream) {
    stream.getTracks().forEach(track => track.stop());
  }

  stream = null;
  els.video.srcObject = null;
  setStatus('カメラ未接続');
  updatePrimaryUi();
}

async function toggleCamera() {
  initSuccessAudio();

  if (stream) {
    stopCamera();
  } else {
    await startCamera();
  }
}

function getVisibleVideoRect() {
  const vw = els.video.videoWidth;
  const vh = els.video.videoHeight;

  if (!vw || !vh) throw new Error('video not ready');

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

  return { visibleX, visibleY, visibleW, visibleH };
}

function getNumericRoiRect() {
  const settings = getSettings();
  const { visibleX, visibleY, visibleW, visibleH } = getVisibleVideoRect();

  const rw = settings.roiW / 100;
  const rh = settings.roiH / 100;
  const rx = settings.roiX / 100;
  const ry = settings.roiY / 100;

  const left = Math.max(0, Math.min(1 - rw, rx - rw / 2));
  const top = Math.max(0, Math.min(1 - rh, ry - rh / 2));

  return {
    x: visibleX + visibleW * left,
    y: visibleY + visibleH * top,
    width: visibleW * rw,
    height: visibleH * rh,
  };
}

function captureNumericRoi() {
  const rect = getNumericRoiRect();
  const outW = 1100;
  const outH = Math.max(220, Math.round(outW * rect.height / rect.width));

  els.captureCanvas.width = outW;
  els.captureCanvas.height = outH;

  const ctx = els.captureCanvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  ctx.drawImage(
    els.video,
    rect.x,
    rect.y,
    rect.width,
    rect.height,
    0,
    0,
    outW,
    outH
  );

  return els.captureCanvas;
}

function captureFingerprint() {
  const rect = getNumericRoiRect();
  const ctx = changeCanvas.getContext('2d', { willReadFrequently: true });

  ctx.drawImage(
    els.video,
    rect.x,
    rect.y,
    rect.width,
    rect.height,
    0,
    0,
    changeCanvas.width,
    changeCanvas.height
  );

  const data = ctx.getImageData(0, 0, changeCanvas.width, changeCanvas.height).data;
  const gray = new Float32Array(changeCanvas.width * changeCanvas.height);
  let sum = 0;

  for (let p = 0, i = 0; p < gray.length; p++, i += 4) {
    const value = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    gray[p] = value;
    sum += value;
  }

  const mean = sum / gray.length;
  for (let i = 0; i < gray.length; i++) gray[i] -= mean;

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
  return {
    changed: 0.0055,
    stable: 0.0045,
  };
}

async function checkDisplayChange() {
  if (
    !readingActive ||
    isQrMode() ||
    isReading ||
    changeCheckBusy
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
      await readNumberOnce(!testMode);
    }
  } finally {
    changeCheckBusy = false;
  }
}

function buildAdaptiveBinary(srcCanvas) {
  const w = srcCanvas.width;
  const h = srcCanvas.height;
  const ctx = srcCanvas.getContext('2d', { willReadFrequently: true });
  const src = ctx.getImageData(0, 0, w, h);
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
      integral[y * iw + x] = integral[(y - 1) * iw + x] + rowSum;
    }
  }

  const out = new Uint8ClampedArray(w * h * 4);
  const radius = Math.max(14, Math.round(Math.min(w, h) * 0.06));

  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(h - 1, y + radius);

    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(w - 1, x + radius);

      const A = integral[y0 * iw + x0];
      const B = integral[y0 * iw + x1 + 1];
      const C = integral[(y1 + 1) * iw + x0];
      const D = integral[(y1 + 1) * iw + x1 + 1];

      const area = (x1 - x0 + 1) * (y1 - y0 + 1);
      const mean = (D - B - C + A) / area;
      const ink = gray[y * w + x] < mean - 9;
      const value = ink ? 0 : 255;
      const i = (y * w + x) * 4;

      out[i] = value;
      out[i + 1] = value;
      out[i + 2] = value;
      out[i + 3] = 255;
    }
  }

  return { w, h, out };
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
    },
  });

  await worker.setParameters({
    tessedit_char_whitelist: '0123456789.',
    tessedit_pageseg_mode: '8',
    preserve_interword_spaces: '0',
    classify_bln_numeric_mode: '1',
    user_defined_dpi: '300',
  });

  return worker;
}

function normalizeNumberFromOcr(raw) {
  const settings = getSettings();
  const digits = String(raw || '')
    .replace(/[Oo]/g, '0')
    .replace(/[^0-9]/g, '');

  if (!digits) return null;

  if (settings.numberMode === 'integer') {
    return String(Number(digits));
  }

  const places = settings.decimalDigits;
  const padded = digits.padStart(places + 1, '0');
  const splitAt = padded.length - places;
  const whole = padded.slice(0, splitAt).replace(/^0+(?=\d)/, '') || '0';

  return `${whole}.${padded.slice(splitAt)}`;
}

async function readNumberOnce(save) {
  if (isReading || !stream) return;

  isReading = true;
  updatePrimaryUi();

  try {
    setStatus(testMode ? 'テスト読み取り中' : '読み取り中');

    const src = captureNumericRoi();
    const pre = buildAdaptiveBinary(src);
    const canvas = renderOcrCanvas(pre);

    const activeWorker = await ensureWorker();
    const result = await activeWorker.recognize(canvas);

    const raw = result?.data?.text ?? '';
    const confidence = Number(result?.data?.confidence ?? 0);
    const value = normalizeNumberFromOcr(raw);

    els.ocrText.textContent = `OCR原文: ${JSON.stringify(raw.trim())}`;
    els.ocrMiniText.textContent = value || 'ERROR';

    if (!value) {
      setStatus(testMode ? 'テスト: OCR_ERROR' : 'OCR_ERROR');
      return;
    }

    if (save) {
      pushRecord(value, 'number', 'OK', confidence);
    } else {
      showReadResult(value, 'number', 'TEST', confidence, true);
    }
  } catch (err) {
    console.error(err);
    setStatus('OCR_ERROR');
  } finally {
    isReading = false;
    els.ocrProgress.value = 0;
    updatePrimaryUi();
  }
}

async function ensureQrEngine() {
  if (!window.QrScanner) return null;

  if (!qrEnginePromise) {
    qrEnginePromise = window.QrScanner
      .createQrEngine('./vendor/qr-scanner-worker.min.js')
      .catch(err => {
        console.warn('QR worker unavailable', err);
        qrEnginePromise = null;
        return null;
      });
  }

  return qrEnginePromise;
}

async function ensureZxingFallback() {
  const api = window.ZXingWASM;
  if (!api?.readBarcodes) return null;

  if (!zxingReadyPromise) {
    try {
      const prep = api.prepareZXingModule?.({
        overrides: {
          locateFile(path, prefix) {
            if (path.endsWith('.wasm')) {
              return 'https://cdn.jsdelivr.net/npm/zxing-wasm@3.1.4/dist/reader/zxing_reader.wasm';
            }
            return prefix + path;
          },
        },
        fireImmediately: true,
      });

      zxingReadyPromise = Promise.resolve(prep)
        .then(() => api)
        .catch(err => {
          console.warn('ZXing WASM unavailable', err);
          zxingReadyPromise = null;
          return null;
        });
    } catch (err) {
      console.warn('ZXing WASM init failed', err);
      return null;
    }
  }

  return zxingReadyPromise;
}

function initSuccessAudio() {
  try {
    if (!successAudioContext) {
      const AudioContextClass =
        window.AudioContext || window.webkitAudioContext;

      if (!AudioContextClass) return;

      successAudioContext = new AudioContextClass();
    }

    if (successAudioContext.state === 'suspended') {
      void successAudioContext.resume();
    }
  } catch (err) {
    console.debug('success audio unavailable', err);
  }
}

function playSuccessCue() {
  try {
    initSuccessAudio();
    const ctx = successAudioContext;
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(190, now);
    osc.frequency.exponentialRampToValueAtTime(105, now + 0.085);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.095);
  } catch (err) {
    console.debug('success sound failed', err);
  }
}

function flashQrSuccess() {
  els.cameraWrap.classList.remove('qr-success');
  void els.cameraWrap.offsetWidth;
  els.cameraWrap.classList.add('qr-success');
}

function getQrSourceRect(expand = 1) {
  const settings = getSettings();
  const { visibleX, visibleY, visibleW, visibleH } = getVisibleVideoRect();

  const baseW = visibleW * (settings.roiW / 100);
  const baseH = visibleH * (settings.roiH / 100);
  const width = Math.min(visibleW, baseW * expand);
  const height = Math.min(visibleH, baseH * expand);

  const centerX = visibleX + visibleW * (settings.roiX / 100);
  const centerY = visibleY + visibleH * (settings.roiY / 100);

  const x = Math.max(
    visibleX,
    Math.min(visibleX + visibleW - width, centerX - width / 2)
  );

  const y = Math.max(
    visibleY,
    Math.min(visibleY + visibleH - height, centerY - height / 2)
  );

  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
  };
}

function getQrScanRegion(detail = false) {
  const rect = getQrSourceRect(detail ? 1.35 : 1.10);
  const targetLongSide = detail ? 1600 : 960;
  const scale = Math.min(1, targetLongSide / Math.max(rect.width, rect.height));

  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    downScaledWidth: Math.max(1, Math.round(rect.width * scale)),
    downScaledHeight: Math.max(1, Math.round(rect.height * scale)),
  };
}

function scoreQrSharpness(canvas) {
  const ctx = qrSharpnessCanvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(canvas, 0, 0, qrSharpnessCanvas.width, qrSharpnessCanvas.height);

  const data = ctx.getImageData(
    0,
    0,
    qrSharpnessCanvas.width,
    qrSharpnessCanvas.height
  ).data;

  const width = qrSharpnessCanvas.width;
  const height = qrSharpnessCanvas.height;
  const gray = new Uint8Array(width * height);

  for (let p = 0, i = 0; p < gray.length; p++, i += 4) {
    gray[p] = Math.round(
      data[i] * 0.299 +
      data[i + 1] * 0.587 +
      data[i + 2] * 0.114
    );
  }

  let score = 0;
  let count = 0;

  for (let y = 1; y < height - 1; y += 2) {
    for (let x = 1; x < width - 1; x += 2) {
      const p = y * width + x;
      const gx = gray[p + 1] - gray[p - 1];
      const gy = gray[p + width] - gray[p - width];
      score += gx * gx + gy * gy;
      count += 1;
    }
  }

  return count ? score / count : 0;
}

function rememberQrCandidate() {
  const rect = getQrSourceRect(1.35);
  const targetLongSide = 1150;
  const scale = Math.min(1, targetLongSide / Math.max(rect.width, rect.height));
  const width = Math.max(1, Math.round(rect.width * scale));
  const height = Math.max(1, Math.round(rect.height * scale));

  const canvas = qrFrameCanvases[qrFrameCursor];
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(
    els.video,
    rect.x,
    rect.y,
    rect.width,
    rect.height,
    0,
    0,
    width,
    height
  );

  qrFrameScores[qrFrameCursor] = scoreQrSharpness(canvas);
  qrFrameCursor = (qrFrameCursor + 1) % qrFrameCanvases.length;
  qrFrameCount = Math.min(qrFrameCount + 1, qrFrameCanvases.length);
}

function getBestQrCandidate() {
  if (!qrFrameCount) return null;

  let bestIndex = 0;
  let bestScore = -Infinity;

  for (let i = 0; i < qrFrameCount; i++) {
    if (qrFrameScores[i] > bestScore) {
      bestScore = qrFrameScores[i];
      bestIndex = i;
    }
  }

  return qrFrameCanvases[bestIndex];
}

function buildLocalContrastQrCanvas(sourceCanvas) {
  const maxLongSide = 1150;
  const scale = Math.min(
    1,
    maxLongSide / Math.max(sourceCanvas.width, sourceCanvas.height)
  );

  const width = Math.max(1, Math.round(sourceCanvas.width * scale));
  const height = Math.max(1, Math.round(sourceCanvas.height * scale));

  qrEnhancedCanvas.width = width;
  qrEnhancedCanvas.height = height;

  const ctx = qrEnhancedCanvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(sourceCanvas, 0, 0, width, height);

  const image = ctx.getImageData(0, 0, width, height);
  const gray = new Uint8Array(width * height);

  for (let p = 0, i = 0; p < gray.length; p++, i += 4) {
    gray[p] = Math.round(
      image.data[i] * 0.299 +
      image.data[i + 1] * 0.587 +
      image.data[i + 2] * 0.114
    );
  }

  const iw = width + 1;
  const integral = new Uint32Array((width + 1) * (height + 1));

  for (let y = 1; y <= height; y++) {
    let rowSum = 0;

    for (let x = 1; x <= width; x++) {
      rowSum += gray[(y - 1) * width + (x - 1)];
      integral[y * iw + x] = integral[(y - 1) * iw + x] + rowSum;
    }
  }

  const radius = Math.max(18, Math.round(Math.min(width, height) * 0.045));
  const gain = 3.2;

  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(height - 1, y + radius);

    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width - 1, x + radius);

      const A = integral[y0 * iw + x0];
      const B = integral[y0 * iw + x1 + 1];
      const C = integral[(y1 + 1) * iw + x0];
      const D = integral[(y1 + 1) * iw + x1 + 1];

      const area = (x1 - x0 + 1) * (y1 - y0 + 1);
      const localMean = (D - B - C + A) / area;
      const source = gray[y * width + x];
      const enhanced = Math.max(
        0,
        Math.min(255, 128 + (source - localMean) * gain)
      );

      const i = (y * width + x) * 4;
      image.data[i] = enhanced;
      image.data[i + 1] = enhanced;
      image.data[i + 2] = enhanced;
      image.data[i + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);
  return qrEnhancedCanvas;
}

function scanCanvasWithJsQr(canvas) {
  if (!window.jsQR) return null;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  const result = window.jsQR(
    imageData.data,
    canvas.width,
    canvas.height,
    { inversionAttempts: 'attemptBoth' }
  );

  return result?.data || null;
}

async function scanCanvasWithQrScanner(canvas) {
  if (!window.QrScanner) return null;

  const engine = await ensureQrEngine();
  if (!engine) return null;

  try {
    const result = await window.QrScanner.scanImage(canvas, {
      qrEngine: engine,
      canvas: qrCanvas,
      alsoTryWithoutScanRegion: true,
      returnDetailedScanResult: true,
    });

    return result?.data || null;
  } catch {
    return null;
  }
}

async function scanCanvasWithZxing(canvas) {
  const api = await ensureZxingFallback();
  if (!api?.readBarcodes) return null;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  try {
    const results = await api.readBarcodes(imageData, {
      formats: ['QRCode'],
      tryHarder: true,
      maxNumberOfSymbols: 1,
    });

    return results?.[0]?.text || results?.[0]?.data || null;
  } catch {
    return null;
  }
}

async function scanBestQrRescue(forceZxing = false) {
  const best = getBestQrCandidate();
  if (!best) return null;

  let decoded = await scanCanvasWithQrScanner(best);
  if (decoded) return decoded;

  const enhanced = buildLocalContrastQrCanvas(best);

  decoded = await scanCanvasWithQrScanner(enhanced);
  if (decoded) return decoded;

  decoded = scanCanvasWithJsQr(enhanced);
  if (decoded) return decoded;

  if (forceZxing || qrMissCount >= 8) {
    decoded = await scanCanvasWithZxing(enhanced);
    if (decoded) return decoded;
  }

  return null;
}

async function decodeQrCurrentFrame(forceRescue = false) {
  if (!stream || !els.video.videoWidth) return null;

  let decoded = null;
  const detailPass = qrMissCount > 0 && qrMissCount % 3 === 0;
  const widePass = forceRescue || (qrMissCount > 0 && qrMissCount % 8 === 0);

  if (window.QrScanner) {
    const engine = await ensureQrEngine();

    if (engine) {
      try {
        const result = await window.QrScanner.scanImage(els.video, {
          scanRegion: getQrScanRegion(detailPass),
          qrEngine: engine,
          canvas: qrCanvas,
          alsoTryWithoutScanRegion: widePass,
          returnDetailedScanResult: true,
        });

        decoded = result?.data || null;
      } catch {
        // No QR in this frame.
      }
    }
  }

  if (!decoded) {
    rememberQrCandidate();

    if (
      forceRescue ||
      (qrFrameCount >= 3 && qrMissCount % 3 === 2)
    ) {
      decoded = await scanBestQrRescue(forceRescue);
    }
  }

  if (!decoded && !window.QrScanner) {
    decoded = scanCanvasWithJsQr(getBestQrCandidate());
  }

  return decoded;
}

function handleQrDecoded(value, save) {
  const normalized = String(value || '').trim();
  if (!normalized) return false;

  els.currentValue.textContent = normalized;
  els.confidence.textContent = 'QR';

  if (!save || testMode) {
    showReadResult(normalized, 'qr', 'TEST', null, true);
    flashQrSuccess();
    playSuccessCue();
    if (navigator.vibrate) navigator.vibrate(45);
    return true;
  }

  if (qrSeen.has(normalized)) {
    setStatus(`登録済み: ${normalized}`);
    lastQrDetected = normalized;
    return false;
  }

  const saved = pushRecord(normalized, 'qr', '登録', null);

  if (saved) {
    lastQrDetected = normalized;
    flashQrSuccess();
    playSuccessCue();
    if (navigator.vibrate) navigator.vibrate(45);
  }

  return saved;
}

async function scanQrOnce(save, forceRescue = true) {
  if (qrScanBusy || !stream) return;

  qrScanBusy = true;

  try {
    setStatus(testMode ? 'テストQR読取中' : 'QR読取中');

    const decoded = await decodeQrCurrentFrame(forceRescue);

    if (!decoded) {
      qrMissCount += 1;
      lastQrDetected = '';
      setStatus(testMode ? 'テスト: QR未検出' : 'QR未検出');
      return;
    }

    qrMissCount = 0;
    handleQrDecoded(decoded, save);
  } finally {
    qrScanBusy = false;
  }
}

async function scanQrFrame() {
  if (
    !readingActive ||
    !isQrMode() ||
    !stream ||
    qrScanBusy
  ) {
    return;
  }

  qrScanBusy = true;

  try {
    const decoded = await decodeQrCurrentFrame(false);

    if (!decoded) {
      qrMissCount += 1;
      lastQrDetected = '';
      return;
    }

    qrMissCount = 0;

    if (lastQrDetected === decoded && qrSeen.has(decoded)) {
      return;
    }

    handleQrDecoded(decoded, !testMode);
  } finally {
    qrScanBusy = false;
  }
}

function stopQrFrameLoop() {
  if (qrLoopHandle === null) return;

  if (
    qrLoopUsesVideoCallback &&
    typeof els.video.cancelVideoFrameCallback === 'function'
  ) {
    els.video.cancelVideoFrameCallback(qrLoopHandle);
  } else {
    cancelAnimationFrame(qrLoopHandle);
  }

  qrLoopHandle = null;
}

function scheduleQrFrameLoop() {
  if (!readingActive || !isQrMode() || !stream) return;

  const callback = now => {
    qrLoopHandle = null;

    if (readingActive && isQrMode() && stream) {
      if (now - qrLastScanAt >= 45) {
        qrLastScanAt = now;
        void scanQrFrame();
      }

      scheduleQrFrameLoop();
    }
  };

  if (typeof els.video.requestVideoFrameCallback === 'function') {
    qrLoopUsesVideoCallback = true;
    qrLoopHandle = els.video.requestVideoFrameCallback(callback);
  } else {
    qrLoopUsesVideoCallback = false;
    qrLoopHandle = requestAnimationFrame(callback);
  }
}

async function startReading() {
  const settings = getSettings();

  if (
    readingActive ||
    !stream ||
    outputFull()
  ) {
    return;
  }

  initSuccessAudio();

  if (settings.readMode === 'manual') {
    if (settings.scanTarget === 'qr') {
      await scanQrOnce(!testMode, true);
    } else {
      await readNumberOnce(!testMode);
    }
    return;
  }

  readingActive = true;
  updatePrimaryUi();

  if (settings.scanTarget === 'qr') {
    qrMissCount = 0;
    qrFrameCursor = 0;
    qrFrameCount = 0;
    qrFrameScores.fill(0);
    lastQrDetected = '';

    if (settings.autoTrigger === 'timer') {
      setStatus(`${settings.timerSeconds}秒間隔でQR読取`);
      await scanQrOnce(!testMode, true);

      if (readingActive) {
        timer = setInterval(
          () => void scanQrOnce(!testMode, true),
          settings.timerSeconds * 1000
        );
      }
    } else {
      setStatus('QR連続読取中');
      scheduleQrFrameLoop();
    }

    return;
  }

  if (settings.autoTrigger === 'timer') {
    setStatus(`${settings.timerSeconds}秒間隔で読み取り`);
    await readNumberOnce(!testMode);

    if (readingActive) {
      timer = setInterval(
        () => void readNumberOnce(!testMode),
        settings.timerSeconds * 1000
      );
    }
  } else {
    changeBaseline = captureFingerprint();
    changeCandidate = null;
    changeCandidateCount = 0;
    setStatus('画面変化を監視中');

    await readNumberOnce(!testMode);

    if (readingActive) {
      timer = setInterval(checkDisplayChange, 120);
    }
  }
}

function stopReading(preserveStatus = false) {
  if (timer) clearInterval(timer);

  timer = null;
  stopQrFrameLoop();
  qrScanBusy = false;
  readingActive = false;
  changeBaseline = null;
  changeCandidate = null;
  changeCandidateCount = 0;

  if (!preserveStatus) {
    setStatus(testMode ? 'テスト読み取り停止' : '読み取り停止');
  }

  updatePrimaryUi();
}

async function handleReadButton() {
  if (readingActive) {
    stopReading(false);
  } else {
    await startReading();
  }
}

function csvEscape(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text)
    ? `"${text.replace(/"/g, '""')}"`
    : text;
}

function buildCsvText() {
  const settings = getSettings();

  if (settings.outputMode === 'one-line') {
    return '\uFEFF' + records.map(record => csvEscape(record.value)).join(',');
  }

  const matrix = buildMatrix();
  const { rows, cols } = previewSize();
  const lines = [];

  const header = [''];
  for (let col = 0; col < cols; col++) {
    header.push(String(col + 1));
  }
  lines.push(header.map(csvEscape).join(','));

  for (let row = 0; row < rows; row++) {
    const values = [String(row + 1)];

    for (let col = 0; col < cols; col++) {
      values.push(matrix[row]?.[col] ?? '');
    }

    lines.push(values.map(csvEscape).join(','));
  }

  return '\uFEFF' + lines.join('\r\n');
}

function makeCsvFile() {
  const csv = buildCsvText();
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  const filename =
    `swt-log-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.csv`;

  const blob = new Blob([csv], {
    type: 'text/csv;charset=utf-8',
  });

  return { blob, filename };
}

function downloadCsv() {
  if (!records.length) return;

  const { blob, filename } = makeCsvFile();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');

  a.download = filename;
  a.href = url;
  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setStatus('CSVを保存しました');
}

async function shareCsv() {
  if (!records.length) return;

  const { blob, filename } = makeCsvFile();

  try {
    const file = new File([blob], filename, {
      type: 'text/csv;charset=utf-8',
    });

    if (
      navigator.share &&
      (!navigator.canShare || navigator.canShare({ files: [file] }))
    ) {
      await navigator.share({
        files: [file],
        title: '読取データ',
        text: 'SWT Loggerで作成したCSVです。',
      });

      setStatus('共有しました');
      return;
    }
  } catch (err) {
    if (err?.name === 'AbortError') {
      setStatus('共有をキャンセル');
      return;
    }
  }

  downloadCsv();
}

function outputSignature(settings) {
  return JSON.stringify({
    outputMode: settings.outputMode,
    useColumns: settings.useColumns,
    columnCount: settings.columnCount,
    useRows: settings.useRows,
    rowCount: settings.rowCount,
    allowGaps: settings.allowGaps,
  });
}

function menuSettingsChanged() {
  if (readingActive) stopReading(false);
  updateNestedSettingsUi();
}

for (const tab of els.menuTabs) {
  tab.addEventListener('click', () => {
    const name = tab.dataset.menu;
    if (openMenuName === name) {
      closeMenu();
    } else {
      openMenu(name);
    }
  });
}

for (const button of els.closeMenuBtns) {
  button.addEventListener('click', closeMenu);
}

for (const button of els.saveSettingsBtns) {
  button.addEventListener('click', () => {
    const section = button.dataset.save || '設定';

    if (readingActive) stopReading(false);

    const before = loadSavedSettings();
    const current = getSettings();
    saveSettings(section);

    if (
      section === 'output' &&
      !testMode &&
      outputSignature(before || {}) !== outputSignature(current)
    ) {
      reflowRecordsForOutput();
    } else {
      updateDerivedUi();
    }
  });
}

for (const input of document.querySelectorAll(
  'input[name="numberMode"], input[name="readMode"], input[name="autoTrigger"], input[name="outputMode"]'
)) {
  input.addEventListener('change', menuSettingsChanged);
}

for (const input of document.querySelectorAll('input[name="scanTarget"]')) {
  input.addEventListener('change', () => {
    syncActiveRoiToProfile();
    activeRoiTarget = checkedValue('scanTarget', 'number');
    loadRoiProfile(activeRoiTarget);
    menuSettingsChanged();
  });
}

for (const input of [
  els.decimalDigits,
  els.roiX,
  els.roiY,
  els.roiW,
  els.roiH,
  els.timerSeconds,
  els.useColumns,
  els.columnCount,
  els.useRows,
  els.rowCount,
  els.allowGaps,
]) {
  input.addEventListener('input', menuSettingsChanged);
  input.addEventListener('change', menuSettingsChanged);
}

els.cameraBtn.addEventListener('click', toggleCamera);
els.readBtn.addEventListener('click', handleReadButton);
els.testModeBtn.addEventListener('click', () => setTestMode(!testMode));
els.blankBtn.addEventListener('click', insertBlank);
els.nextRowBtn.addEventListener('click', moveNextRow);
els.undoBtn.addEventListener('click', undoLast);
els.shareBtn.addEventListener('click', shareCsv);
els.saveBtn.addEventListener('click', downloadCsv);

window.addEventListener('beforeunload', () => {
  stopReading(true);

  if (stream) {
    stream.getTracks().forEach(track => track.stop());
  }

  if (worker) worker.terminate();
});

const initialSettings = loadSavedSettings();

if (initialSettings) {
  applySettings(initialSettings);
} else {
  updateAllSettingsUi();
  saveSettings('初期設定');
}

updateDerivedUi();
closeMenu();
