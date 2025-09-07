/* global setStatus, addChat, toast, toggleChrome */
(() => {
  // ================================
  //  DOM short-hands
  // ================================
  const $ = (id) => document.getElementById(id);
  const $video   = $('preview');
  const $canvas  = $('canvas');
  const $select  = $('device-select');
  const $zoom    = $('zoom-range');
  const $zoomLab = $('zoom-label');

  const $btnStart   = $('btn-start');
  const $btnSwitch  = $('btn-switch');
  const $btnCapture = $('btn-capture');
  const $btnRec     = $('btn-rec'); // ここでは未実装（別途MediaRecorderで拡張可）
  const $hitbox     = $('hitbox');

  // ================================
  //  State
  // ================================
  let stream = null;
  let videoTrack = null;
  let imageCapture = null; // Chrome系でのみ動作することが多い
  let devices = [];        // videoinput の list
  let currentDeviceId = null;
  let preferFacing = 'environment'; // user | environment

  // Capabilities
  let caps = {};
  let settings = {};

  // Zoom（フォールバック用）
  let hasNativeZoom = false;
  let cssZoom = 1;

  // Torch
  let hasTorch = false;
  let torchOn = false;
  let torchToggleTimer = null;

  // ================================
  //  Utils
  // ================================
  const safeNumber = (v, def) => (typeof v === 'number' && !Number.isNaN(v) ? v : def);

  const stopStream = () => {
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      stream = null;
    }
    videoTrack = null;
    imageCapture = null;
    caps = {};
    settings = {};
    hasNativeZoom = false;
    hasTorch = false;
    torchOn = false;
    cssZoom = 1;
    $video.style.transform = '';
  };

  const enumerate = async () => {
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      devices = list.filter(d => d.kind === 'videoinput');
      $select.innerHTML = devices.map((d, i) => {
        const label = d.label || `カメラ ${i + 1}`;
        return `<option value="${d.deviceId}">${label}</option>`;
      }).join('') || '<option value="">デフォルトカメラ</option>';
      if (currentDeviceId) $select.value = currentDeviceId;
    } catch (e) {
      console.warn('enumerateDevices failed', e);
    }
  };

  const bindDeviceChange = () => {
    if (!navigator.mediaDevices?.addEventListener) return;
    navigator.mediaDevices.addEventListener('devicechange', async () => {
      await enumerate();
    });
  };

  // ================================
  //  Camera start
  // ================================
  const startCamera = async (deviceId = null) => {
    stopStream();

    /** @type {MediaStreamConstraints} */
    const constraints = {
      audio: false,
      video: deviceId
        ? { deviceId: { exact: deviceId } }
        : {
            facingMode: { ideal: preferFacing },
            // iOS/Safariは解像度指定に敏感なので控えめ
            width:  { ideal: 1280 },
            height: { ideal: 720 }
          }
    };

    try {
      setStatus('カメラ起動中…', true);
      stream = await navigator.mediaDevices.getUserMedia(constraints);
      $video.srcObject = stream;
      await $video.play();

      videoTrack = stream.getVideoTracks()[0];
      settings = videoTrack.getSettings?.() || {};
      currentDeviceId = settings.deviceId || deviceId || null;

      // ImageCapture（可能なら）
      try {
        // eslint-disable-next-line no-undef
        imageCapture = typeof ImageCapture !== 'undefined' ? new ImageCapture(videoTrack) : null;
      } catch {
        imageCapture = null;
      }

      // 能力取得
      caps = videoTrack.getCapabilities?.() || {};

      // Zoom設定
      setupZoomUI();

      // Torch判定
      hasTorch = !!(caps.torch);
      torchOn = false;

      // ラベル取得のため（iOSは許可後にしか見えない）
      await enumerate();

      setStatus('カメラ起動中', true);
    } catch (err) {
      console.error('getUserMedia error', err);
      setStatus('カメラ起動失敗', false);
      const name = err && (err.name || err.message) || 'UnknownError';
      if (name === 'NotAllowedError') toast('カメラ権限が拒否されました。ブラウザのサイト設定から許可してください。');
      else if (name === 'NotFoundError') toast('カメラデバイスが見つかりません。別の端末かブラウザでお試しください。');
      else if (name === 'NotReadableError') toast('他のアプリでカメラが使用中の可能性があります。アプリを閉じてから再試行してください。');
      else toast(`カメラ起動に失敗: ${name}`);
      throw err;
    }
  };

  // ================================
  //  Zoom
  // ================================
  function setupZoomUI() {
    // ネイティブズーム能力
    const min = safeNumber(caps.zoom?.min, 1);
    const max = safeNumber(caps.zoom?.max, 1);
    hasNativeZoom = Number.isFinite(min) && Number.isFinite(max) && max > min;

    if (hasNativeZoom) {
      // 端末ズーム
      $zoom.min = String(min);
      $zoom.max = String(max);
      $zoom.step = String(caps.zoom?.step || 0.1);
      const current = safeNumber(videoTrack.getSettings?.().zoom, min);
      $zoom.value = String(current);
      $zoomLab.textContent = `${Number($zoom.value).toFixed(1)}×`;
    } else {
      // フォールバック：CSS拡大（1〜5）
      $zoom.min = '1'; $zoom.max = '5'; $zoom.step = '0.1';
      $zoom.value = String(cssZoom);
      $zoomLab.textContent = `${Number($zoom.value).toFixed(1)}×`;
    }
  }

  async function applyZoomUI(value) {
    const z = Number(value);
    if (hasNativeZoom) {
      try {
        await videoTrack.applyConstraints({ advanced: [{ zoom: z }] });
        $zoomLab.textContent = `${z.toFixed(1)}×`;
      } catch (e) {
        console.warn('applyConstraints(zoom) failed, fallback to CSS', e);
        hasNativeZoom = false;
        cssZoom = z;
        $video.style.transform = `scale(${cssZoom})`;
        $zoomLab.textContent = `${z.toFixed(1)}×`;
      }
    } else {
      cssZoom = Math.max(1, Math.min(5, z));
      $video.style.transform = `scale(${cssZoom})`;
      $zoomLab.textContent = `${cssZoom.toFixed(1)}×`;
    }
  }

  // ピンチズーム（フォールバックにも効く）
  let pinchStartDist = null;
  let pinchStartZoom = null;
  function dist(touches) {
    const [a, b] = touches;
    const dx = a.clientX - b.clientX;
    const dy = a.clientY - b.clientY;
    return Math.hypot(dx, dy);
  }
  $video.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      pinchStartDist = dist(e.touches);
      pinchStartZoom = Number($zoom.value);
    }
  }, { passive: true });
  $video.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2 && pinchStartDist) {
      const ratio = dist(e.touches) / pinchStartDist;
      const target = pinchStartZoom * ratio;
      $zoom.value = String(Math.max(Number($zoom.min), Math.min(Number($zoom.max), target)));
      applyZoomUI($zoom.value);
    }
  }, { passive: true });
  $video.addEventListener('touchend', () => {
    pinchStartDist = null; pinchStartZoom = null;
  });

  // ================================
  //  Focus (best effort)
  // ================================
  async function tapToFocus(ev) {
    if (!videoTrack?.applyConstraints || !caps || (!caps.focusMode && !caps.pointsOfInterest)) {
      return; // 非対応端末は無視
    }
    // 画面座標 → 正規化（0-1）
    const rect = $video.getBoundingClientRect();
    const x = (ev.clientX - rect.left) / rect.width;
    const y = (ev.clientY - rect.top) / rect.height;

    const adv = [];
    if (caps.focusMode && Array.isArray(caps.focusMode)) {
      // single-shot があれば指定。なければ continuous を維持
      const mode = caps.focusMode.includes('single-shot') ? 'single-shot' : (caps.focusMode[0] || undefined);
      if (mode) adv.push({ focusMode: mode });
    }
    if (caps.pointsOfInterest) {
      adv.push({ pointsOfInterest: [{ x, y }] });
    }

    if (adv.length) {
      try {
        await videoTrack.applyConstraints({ advanced: adv });
        toast('フォーカス');
      } catch (e) {
        // 失敗しても致命的ではない
        console.warn('tapToFocus failed', e);
      }
    }
  }
  $video.addEventListener('click', tapToFocus);

  // ================================
  //  Torch (long-press shutter)
  // ================================
  const torchSupported = () => hasTorch && !!videoTrack?.applyConstraints;
  function scheduleTorchToggle() {
    if (!torchSupported()) return;
    clearTimeout(torchToggleTimer);
    torchToggleTimer = setTimeout(async () => {
      torchOn = !torchOn;
      try {
        await videoTrack.applyConstraints({ advanced: [{ torch: torchOn }] });
        toast(`ライト${torchOn ? 'ON' : 'OFF'}`);
      } catch (e) {
        console.warn('torch toggle failed', e);
      }
    }, 520); // 長押し認定時間
  }
  function cancelTorchToggle() {
    clearTimeout(torchToggleTimer);
    torchToggleTimer = null;
  }

  // ================================
  //  Capture
  // ================================
  async function captureFrame() {
    if (!stream) { toast('先にカメラを起動してください'); return null; }

    try {
      // 可能なら ImageCapture の高品質フレーム
      if (imageCapture?.grabFrame) {
        const bmp = await imageCapture.grabFrame();
        $canvas.width = bmp.width;
        $canvas.height = bmp.height;
        const ctx = $canvas.getContext('2d');
        ctx.drawImage(bmp, 0, 0);
        return await new Promise(res => $canvas.toBlob(res, 'image/jpeg', 0.9));
      }
    } catch (e) {
      console.warn('grabFrame failed, fallback to drawImage', e);
    }

    // フォールバック：<video> → canvas
    const vw = videoTrack?.getSettings?.().width  || $video.videoWidth  || 1280;
    const vh = videoTrack?.getSettings?.().height || $video.videoHeight || 720;
    $canvas.width = vw;
    $canvas.height = vh;
    const ctx = $canvas.getContext('2d');

    // CSS拡大中でも実サイズで描画
    ctx.drawImage($video, 0, 0, $canvas.width, $canvas.height);

    return await new Promise(res => $canvas.toBlob(res, 'image/jpeg', 0.9));
  }

  // ================================
  //  Events wiring
  // ================================
  $btnStart?.addEventListener('click', async () => {
    try {
      await startCamera($select.value || null);
      setStatus('カメラ起動中', true);
      toggleChrome(true);
    } catch {
      // エラーは startCamera 内で通知済み
    }
  });

  $select?.addEventListener('change', async (e) => {
    const nextId = e.target.value || null;
    await startCamera(nextId);
  });

  $btnSwitch?.addEventListener('click', async () => {
    // deviceId が複数あるなら次へ、なければ facingMode をトグル
    if (devices.length > 1 && currentDeviceId) {
      const idx = devices.findIndex(d => d.deviceId === currentDeviceId);
      const next = devices[(idx + 1) % devices.length];
      await startCamera(next.deviceId);
    } else {
      preferFacing = (preferFacing === 'environment') ? 'user' : 'environment';
      await startCamera(null);
    }
    toast('カメラを切り替えました');
  });

  $zoom?.addEventListener('input', (e) => {
    applyZoomUI(e.target.value);
  });

  // シャッター（短押し：撮影／長押し：ライト切替）
  $btnCapture?.addEventListener('pointerdown', scheduleTorchToggle);
  $btnCapture?.addEventListener('pointerup', async () => {
    if (torchToggleTimer) {
      // 長押し認定 → ここでは撮影しない
      cancelTorchToggle();
      return;
    }
    // 通常シャッター → キャプチャ
    try {
      const blob = await captureFrame();
      if (!blob) return;
      // ここで送信（例：FormDataで /api へ）
      // const fd = new FormData(); fd.append('image', blob, 'capture.jpg');
      // const res = await fetch('/api/vision', { method: 'POST', body: fd });
      addChat('（サンプル）画像を送信しました。サーバ応答待ち…', 'me');
    } catch (e) {
      console.error(e);
      toast('キャプチャに失敗しました');
    }
  });
  $btnCapture?.addEventListener('pointercancel', cancelTorchToggle);
  $btnCapture?.addEventListener('pointerleave', cancelTorchToggle);

  // 背景タップで UI 表示/非表示（index.html 側でハンドル）
  $hitbox?.addEventListener('click', () => {
    // no-op: toggleChrome は index 側で紐付け済み
  });

  // MediaDevices 変更監視
  bindDeviceChange();

  // ================================
  //  Permissions guidance
  // ================================
  (async () => {
    // 事前に permission を覗いて案内（対応ブラウザのみ）
    try {
      const q = await navigator.permissions?.query?.({ name: 'camera' });
      if (q && q.state === 'denied') {
        toast('カメラ権限がブロックされています。サイト設定から許可してください。');
      }
      // 状態変化でリトライ案内
      q?.addEventListener('change', () => {
        if (q.state === 'granted') toast('カメラ権限が許可されました。「起動」を押してください。');
      });
    } catch { /* ignore */ }
  })();

  // ================================
  //  Public helpers (optional)
  // ================================
  // 必要なら window に出して他のスクリプトから操作できるようにする
  window.__camera = {
    start: startCamera,
    stop: stopStream,
    capture: captureFrame,
    switch: async () => $btnSwitch?.click(),
    get state() { return { devices, currentDeviceId, caps, settings, hasNativeZoom, hasTorch, torchOn }; },
  };
})();
