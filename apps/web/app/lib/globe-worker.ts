self.onmessage = async (e: MessageEvent<{ canvas: OffscreenCanvas }>) => {
  const { canvas } = e.data;
  const ctx = canvas.getContext("2d")!;

  const SIZE = canvas.width;
  const VISIBLE_ROWS = Math.ceil(SIZE * 0.15);
  const R = SIZE / 2;
  const TEX_W = 1024;
  const TEX_H = 512;

  const response = await fetch("/satellite-world-topo-map.webp");
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob, { resizeWidth: TEX_W, resizeHeight: TEX_H });

  const tmp = new OffscreenCanvas(TEX_W, TEX_H);
  const tctx = tmp.getContext("2d")!;
  tctx.drawImage(bitmap, 0, 0);
  const texPx = tctx.getImageData(0, 0, TEX_W, TEX_H).data;
  bitmap.close();

  const pixels = VISIBLE_ROWS * SIZE;
  const uBase = new Float32Array(pixels);
  const vRow = new Int32Array(pixels);
  const sphereMask = new Uint8Array(pixels);
  const shadeDim = new Uint8Array(pixels);

  for (let y = 0; y < VISIBLE_ROWS; y++) {
    for (let x = 0; x < SIZE; x++) {
      const nx = (x - R) / R;
      const ny = (y - R) / R;
      if (nx * nx + ny * ny >= 1) continue;
      const nz = Math.sqrt(1 - nx * nx - ny * ny);
      const lat = Math.asin(-ny);
      const lon = Math.atan2(nx, nz);
      const idx = y * SIZE + x;
      uBase[idx] = (lon / (2 * Math.PI) + 0.5) * TEX_W;
      vRow[idx] = Math.min(Math.floor((0.5 - lat / Math.PI) * TEX_H), TEX_H - 1) * TEX_W;
      sphereMask[idx] = 1;
      const limbDark = Math.pow(nz, 0.6);
      const dirLight = Math.max(0, nx * -0.35 + ny * -0.45 + nz * 0.7);
      const brightness = limbDark * 0.55 + dirLight * 0.45;
      shadeDim[idx] = Math.round((1 - brightness) * 185);
    }
  }

  const frameData = ctx.createImageData(SIZE, VISIBLE_ROWS);
  const out = frameData.data;
  let angle = 0;

  function render() {
    const uShift = (angle / (2 * Math.PI)) * TEX_W;
    for (let i = 0; i < pixels; i++) {
      if (!sphereMask[i]) continue;
      let u = uBase[i] - uShift;
      u = ((u % TEX_W) + TEX_W) % TEX_W;
      const pi = (vRow[i] + Math.floor(u)) * 4;
      const po = i * 4;
      const dim = shadeDim[i];
      out[po] = texPx[pi] - dim;
      out[po + 1] = texPx[pi + 1] - dim;
      out[po + 2] = texPx[pi + 2] - dim + 12;
      out[po + 3] = 255;
    }
    ctx.putImageData(frameData, 0, 0);
    angle = (angle + 0.003) % (2 * Math.PI);
    requestAnimationFrame(render);
  }

  requestAnimationFrame(render);
};
