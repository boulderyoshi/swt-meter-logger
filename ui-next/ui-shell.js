(() => {
  const q = selector => document.querySelector(selector);
  const qa = selector => [...document.querySelectorAll(selector)];

  const bottomSheet = q('#bottomSheet');
  const sheetGrabber = q('#sheetGrabber');
  const settingsSheet = q('#settingsSheet');
  const settingsOpenBtn = q('#settingsOpenBtn');
  const settingsCloseBtn = q('#settingsCloseBtn');
  const currentValue = q('#currentValue');
  const floatingResult = q('#floatingResult');
  const resultSource = q('#resultSource');
  const resultTime = q('#resultTime');
  const scanHint = q('#scanHint');
  const cameraBtn = q('#cameraBtn');
  const resetSettingsBtn = q('#resetSettingsBtn');
  const modeButtons = qa('.mode-btn');
  const targetRadios = qa('input[name="scanTarget"]');

  const sheetStates = ['compact', 'mid', 'full'];
  let sheetStateIndex = 0;
  let touchStartY = null;
  let touchMoved = false;
  let resultPulseTimer = null;

  function setSheetState(index) {
    sheetStateIndex = Math.max(0, Math.min(sheetStates.length - 1, index));
    const state = sheetStates[sheetStateIndex];
    bottomSheet.dataset.state = state;
    sheetGrabber.setAttribute(
      'aria-label',
      state === 'full'
        ? '履歴を縮小'
        : '履歴を展開'
    );
  }

  function moveSheet(delta) {
    setSheetState(sheetStateIndex + delta);
  }

  function checkedTarget() {
    return q('input[name="scanTarget"]:checked')?.value || 'number';
  }

  function syncModeUi() {
    const target = checkedTarget();

    for (const button of modeButtons) {
      const active = button.dataset.target === target;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    }

    if (resultSource) {
      resultSource.textContent = target === 'qr' ? 'QR' : 'OCR';
    }

    updateScanHint();
  }

  function updateScanHint() {
    if (!scanHint || !cameraBtn) return;

    const connected = cameraBtn.textContent.includes('切断');
    if (!connected) {
      scanHint.textContent = 'カメラを接続してください';
      return;
    }

    scanHint.textContent =
      checkedTarget() === 'qr'
        ? '枠内にQRコードを合わせてください'
        : '枠内に読み取りたい数字を合わせてください';
  }

  function setTarget(target) {
    const radio = q('input[name="scanTarget"][value="' + target + '"]');
    if (!radio || radio.checked) {
      syncModeUi();
      return;
    }

    radio.checked = true;
    radio.dispatchEvent(new Event('change', { bubbles: true }));
    syncModeUi();
  }

  function openSettings() {
    settingsSheet.classList.add('open');
    settingsSheet.setAttribute('aria-hidden', 'false');
    settingsCloseBtn.focus({ preventScroll: true });
  }

  function closeSettings() {
    settingsSheet.classList.remove('open');
    settingsSheet.setAttribute('aria-hidden', 'true');
    settingsOpenBtn.focus({ preventScroll: true });
  }

  function pulseResult() {
    if (!currentValue || currentValue.textContent.trim() === '--') return;

    const now = new Date();
    resultTime.textContent = now.toLocaleTimeString('ja-JP', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    floatingResult.classList.remove('result-pulse');
    void floatingResult.offsetWidth;
    floatingResult.classList.add('result-pulse');

    if (resultPulseTimer) clearTimeout(resultPulseTimer);
    resultPulseTimer = setTimeout(() => {
      floatingResult.classList.remove('result-pulse');
    }, 220);
  }

  for (const button of modeButtons) {
    button.addEventListener('click', () => setTarget(button.dataset.target));
  }

  for (const radio of targetRadios) {
    radio.addEventListener('change', syncModeUi);
  }

  settingsOpenBtn.addEventListener('click', openSettings);
  settingsCloseBtn.addEventListener('click', closeSettings);

  settingsSheet.addEventListener('click', event => {
    if (event.target === settingsSheet) closeSettings();
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && settingsSheet.classList.contains('open')) {
      closeSettings();
    }
  });

  sheetGrabber.addEventListener('click', () => {
    if (touchMoved) {
      touchMoved = false;
      return;
    }

    if (sheetStateIndex === sheetStates.length - 1) {
      setSheetState(0);
    } else {
      moveSheet(1);
    }
  });

  sheetGrabber.addEventListener(
    'touchstart',
    event => {
      touchStartY = event.touches[0]?.clientY ?? null;
      touchMoved = false;
    },
    { passive: true }
  );

  sheetGrabber.addEventListener(
    'touchend',
    event => {
      if (touchStartY === null) return;

      const endY = event.changedTouches[0]?.clientY ?? touchStartY;
      const delta = endY - touchStartY;
      touchStartY = null;

      if (Math.abs(delta) < 34) return;

      touchMoved = true;
      if (delta < 0) {
        moveSheet(1);
      } else {
        moveSheet(-1);
      }
    },
    { passive: true }
  );

  if (currentValue) {
    new MutationObserver(pulseResult).observe(currentValue, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }

  if (cameraBtn) {
    new MutationObserver(updateScanHint).observe(cameraBtn, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }

  if (resetSettingsBtn) {
    resetSettingsBtn.addEventListener('click', () => {
      window.setTimeout(syncModeUi, 0);
    });
  }

  setSheetState(0);
  syncModeUi();
})();