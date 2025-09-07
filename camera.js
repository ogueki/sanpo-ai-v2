/* global setStatus, addChat, toast */
(() => {
  // ===== state =====
  let stream = null;
  let devices = [];
  let currentDeviceId = null;
  let preferFacing = 'environment'; // 'user' | 'environment'

  const $ = (id) => document.getElementById(id);
  const $video  = $('preview');
  const $select = $('device-select');

  // ===== helpers =====
  const stopStream = () => {
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      stream = null;
    }
  };

  const fillDevices = async () => {
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      devices = list.filter(d => d.kind === 'videoinput');
      $select.innerHTML = devices.map((d, i) => {
        const label = d.label || `カメラ ${i + 1}`;
        return `<option value="${d.deviceId}">${label}</option>`;
      }).join('') || '<option value="">デフォルトカメラ</option>';
      if (currentDeviceId) $select.value = currentDeviceId;
    } catch (e) {
      console.warn('enumerateDevices 失敗', e);
    }
  };

  const startCamera = async (deviceId = null) => {
    stopStream();

    /** @type {MediaStreamConstraints} */
    const constraints = {
      audio: false,
      video: deviceId
        ? { deviceId: { exact: deviceId } }
        : { facingMode: { ideal: preferFacing } }
    };

    try {
      setStatus('カメラ起動中…', true);
      stream = await navigator.mediaDevices.getUserMedia(constraints);
      $video.srcObject = stream;
      await $video.play();

      const track = stream.getVideoTracks()[0];
      const settings = track.getSettings();
      currentDeviceId = settings.deviceId || null;

      await fillDevices();
      setStatus('カメラ起動中', true);
    } catch (err) {
      console.error('getUserMedia エラー', err);
      setStatus('カメラ起動失敗', false);
      toast(`カメラ起動に失敗: ${err.name || err.message}`);
    }
  };

  const switchCamera = async () => {
    if (devices.length > 1 && currentDeviceId) {
      const idx = devices.findIndex(d => d.deviceId === currentDeviceId);
      const next = devices[(idx + 1) % devices.length];
      await startCamera(next.deviceId);
    } else {
      preferFacing = (preferFacing === 'environment') ? 'user' : 'environment';
      await startCamera(null);
    }
    toast('カメラを切り替えました');
  };

  // ===== events =====
  $('btn-start')?.addEventListener('click', async () => {
    await startCamera($select.value || null);
  });

  $select?.addEventListener('change', async (e) => {
    const nextId = e.target.value || null;
    await startCamera(nextId);
  });

  $('btn-switch')?.addEventListener('click', switchCamera);

  $('btn-capture')?.addEventListener('click', async () => {
    try {
      if (!stream) { toast('先にカメラを起動してください'); return; }
      const track = stream.getVideoTracks()[0];
      const settings = track.getSettings();
      const videoWidth  = settings.width  || 1280;
      const videoHeight = settings.height || 720;

      const canvas = $('canvas');
      canvas.width = videoWidth;
      canvas.height = videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage($video, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(async (blob) => {
        if (!blob) { toast('画像の作成に失敗'); return; }
        // ここでサーバへアップロードする場合は FormData などで送信
        // const fd = new FormData(); fd.append('image', blob, 'capture.jpg');
        // const res = await fetch('/api/vision', { method:'POST', body: fd });

        addChat('（サンプル）画像を送信しました。サーバ応答待ち…', 'me');
      }, 'image/jpeg', 0.85);
    } catch (e) {
      console.error(e);
      toast('キャプチャに失敗しました');
    }
  });

  $('btn-rec')?.addEventListener('click', async () => {
    if (!('MediaRecorder' in window)) {
      toast('このブラウザは録音に対応していません');
      return;
    }
    // 録音機能は必要に応じて実装
  });

  $('btn-reset')?.addEventListener('click', () => {
    stopStream();
    setStatus('待機中', false);
  });

  // 自動起動はしない（iOSはユーザー操作が必要なため）
})();
