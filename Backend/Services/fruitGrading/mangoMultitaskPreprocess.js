/**
 * Mirrors Mango-Grading-RP preprocessing: cleanup_background, compute_classical_features,
 * and eval image tensor (resize → center crop → [0,1] → normalize NCHW).
 */

const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const FEATURE_ORDER = [
  "yellow_ratio",
  "green_ratio",
  "dark_spot_ratio",
  "blemish_ratio",
  "color_consistency",
  "roughness",
  "edge_density",
  "gray_variance",
];

function loadMangoGradingConfigSync(configPath) {
  const text = fs.readFileSync(configPath, "utf8");
  try {
    const yaml = require("js-yaml");
    return yaml.load(text);
  } catch (e) {
    if (e.code !== "MODULE_NOT_FOUND") throw e;
  }

  const imageSize = parseInt(text.match(/^\s*image_size:\s*(\d+)\s*$/m)?.[1] || "224", 10);
  const use_background_cleanup = /^\s*use_background_cleanup:\s*true\s*$/m.test(text);
  const use_crop_refinement = /^\s*use_crop_refinement:\s*true\s*$/m.test(text);
  const meanMatch = text.match(
    /^\s*normalize_mean:\s*\[\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\]\s*$/m
  );
  const stdMatch = text.match(
    /^\s*normalize_std:\s*\[\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\]\s*$/m
  );
  return {
    training: { image_size: imageSize },
    preprocessing: {
      use_background_cleanup,
      use_crop_refinement,
      normalize_mean: meanMatch
        ? [parseFloat(meanMatch[1]), parseFloat(meanMatch[2]), parseFloat(meanMatch[3])]
        : [0.485, 0.456, 0.406],
      normalize_std: stdMatch
        ? [parseFloat(stdMatch[1]), parseFloat(stdMatch[2]), parseFloat(stdMatch[3])]
        : [0.229, 0.224, 0.225],
    },
  };
}

/** OpenCV-style BGR uint8 → HSV uint8 (H 0–180, S,V 0–255). */
function bgrToHsv(b, g, r) {
  const rF = r / 255;
  const gF = g / 255;
  const bF = b / 255;
  const maxc = Math.max(rF, gF, bF);
  const minc = Math.min(rF, gF, bF);
  const diff = maxc - minc;
  let h = 0;
  if (diff >= 1e-6) {
    if (maxc === rF) {
      h = ((60 * ((gF - bF) / diff) + 360) % 360);
    } else if (maxc === gF) {
      h = (60 * ((bF - rF) / diff) + 120) % 360;
    } else {
      h = (60 * ((rF - gF) / diff) + 240) % 360;
    }
  }
  const h8 = Math.round(h / 2);
  const s8 = maxc < 1e-6 ? 0 : Math.round((diff / maxc) * 255);
  const v8 = Math.round(maxc * 255);
  return [h8, s8, v8];
}

/** BT.601 gray from B,G,R (OpenCV BGR2GRAY). */
function bgrToGray(b, g, r) {
  return Math.round(0.114 * b + 0.587 * g + 0.299 * r);
}

function linearizeSrgb(u8) {
  const c = u8 / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** BGR bytes → Lab a channel (OpenCV-style scaling), float before clipping to u8. */
function bgrToLabA(b, g, r) {
  const R = linearizeSrgb(r);
  const G = linearizeSrgb(g);
  const B = linearizeSrgb(b);
  const X = 0.4124564 * R + 0.3575761 * G + 0.1804375 * B;
  const Y = 0.2126729 * R + 0.7151522 * G + 0.072175 * B;
  const Z = 0.0193339 * R + 0.119192 * G + 0.9503041 * B;
  const Xn = 0.95047;
  const Yn = 1.0;
  const Zn = 1.08883;
  const fx = X / Xn > 0.008856 ? Math.cbrt(X / Xn) : (7.787 * X) / Xn + 16 / 116;
  const fy = Y / Yn > 0.008856 ? Math.cbrt(Y / Yn) : (7.787 * Y) / Yn + 16 / 116;
  const fz = Z / Zn > 0.008856 ? Math.cbrt(Z / Zn) : (7.787 * Z) / Zn + 16 / 116;
  const a = 500 * (fx - fy);
  const a8 = Math.min(255, Math.max(0, Math.round(a + 128)));
  return a8;
}

function morphErode(src, w, h) {
  const half = 2;
  const dst = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let m = 255;
      for (let dy = -half; dy <= half; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -half; dx <= half; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          const v = src[yy * w + xx];
          if (v < m) m = v;
        }
      }
      dst[y * w + x] = m;
    }
  }
  return dst;
}

function morphDilate(src, w, h) {
  const half = 2;
  const dst = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let m = 0;
      for (let dy = -half; dy <= half; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -half; dx <= half; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          const v = src[yy * w + xx];
          if (v > m) m = v;
        }
      }
      dst[y * w + x] = m;
    }
  }
  return dst;
}

/** MORPH_OPEN then MORPH_CLOSE with 5×5 rectangular kernel (matches cv2). */
function morphOpenThenClose(mask, w, h) {
  let t = morphErode(mask, w, h);
  t = morphDilate(t, w, h);
  t = morphDilate(t, w, h);
  t = morphErode(t, w, h);
  return t;
}

function largestComponentBoundingBox(mask, w, h) {
  const visited = new Uint8Array(w * h);
  let bestArea = 0;
  let bx0 = 0;
  let by0 = 0;
  let bx1 = 0;
  let by1 = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (visited[idx] || mask[idx] < 128) continue;
      const stack = [idx];
      visited[idx] = 1;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      let area = 0;
      while (stack.length) {
        const cur = stack.pop();
        area++;
        const cy = Math.floor(cur / w);
        const cx = cur % w;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;
        const nbs = [];
        if (cx > 0) nbs.push(cur - 1);
        if (cx < w - 1) nbs.push(cur + 1);
        if (cy > 0) nbs.push(cur - w);
        if (cy < h - 1) nbs.push(cur + w);
        for (const n of nbs) {
          if (visited[n] || mask[n] < 128) continue;
          visited[n] = 1;
          stack.push(n);
        }
      }
      if (area > bestArea) {
        bestArea = area;
        bx0 = minX;
        bx1 = maxX;
        by0 = minY;
        by1 = maxY;
      }
    }
  }
  if (bestArea === 0) return null;
  return { x0: bx0, y0: by0, x1: bx1, y1: by1, area: bestArea };
}

/**
 * @param {Buffer|Uint8Array} rgb - RGB interleaved, length w*h*3
 */
function cleanupBackground(rgb, w, h, cropRefinement) {
  const satMask = new Uint8Array(w * h);
  const valMask = new Uint8Array(w * h);
  const rawMask = new Uint8Array(w * h);

  for (let i = 0, p = 0; i < rgb.length; i += 3, p++) {
    const R = rgb[i];
    const G = rgb[i + 1];
    const B = rgb[i + 2];
    const [hue, sat, val] = bgrToHsv(B, G, R);
    satMask[p] = sat >= 25 && sat <= 255 ? 255 : 0;
    valMask[p] = val >= 35 && val <= 255 ? 255 : 0;
    rawMask[p] = satMask[p] && valMask[p] ? 255 : 0;
  }

  const cleaned = morphOpenThenClose(rawMask, w, h);
  const box = largestComponentBoundingBox(cleaned, w, h);
  if (!box) {
    return { rgb: rgb instanceof Buffer ? new Uint8Array(rgb) : Uint8Array.from(rgb), w, h };
  }

  let { x0: x, y0: y, x1: x1, y1: y1 } = box;
  let cw = x1 - x + 1;
  let ch = y1 - y + 1;

  if (cropRefinement) {
    x = Math.max(0, x - 6);
    y = Math.max(0, y - 6);
    cw = Math.min(w - x, cw + 12);
    ch = Math.min(h - y, ch + 12);
  }

  if (cw <= 0 || ch <= 0) {
    return { rgb: rgb instanceof Buffer ? new Uint8Array(rgb) : Uint8Array.from(rgb), w, h };
  }

  const out = new Uint8Array(cw * ch * 3);
  for (let row = 0; row < ch; row++) {
    const srcRow = (y + row) * w * 3 + x * 3;
    out.set(rgb.subarray(srcRow, srcRow + cw * 3), row * cw * 3);
  }
  return { rgb: out, w: cw, h: ch };
}

function computeClassicalFeatures(rgb, w, h) {
  const hue = new Float32Array(w * h);
  const sat = new Float32Array(w * h);
  const val = new Float32Array(w * h);
  const gray = new Float32Array(w * h);
  const labA = new Float32Array(w * h);

  for (let i = 0, p = 0; i < rgb.length; i += 3, p++) {
    const R = rgb[i];
    const G = rgb[i + 1];
    const B = rgb[i + 2];
    const [h8, s8, v8] = bgrToHsv(B, G, R);
    hue[p] = h8;
    sat[p] = s8;
    val[p] = v8;
    gray[p] = bgrToGray(B, G, R);
    labA[p] = bgrToLabA(B, G, R);
  }

  let validCount = 0;
  for (let p = 0; p < w * h; p++) {
    if (val[p] > 20) validCount++;
  }
  const validPixels = Math.max(validCount, 1);

  let yellow = 0;
  let green = 0;
  let dark = 0;
  let blemish = 0;
  let labSum = 0;
  let labSumSq = 0;

  for (let p = 0; p < w * h; p++) {
    const v = val[p];
    if (v <= 20) continue;
    const hu = hue[p];
    const sa = sat[p];
    if (hu >= 15 && hu <= 40 && sa >= 40 && v >= 60) yellow++;
    if (hu >= 35 && hu <= 85 && sa >= 35 && v >= 45) green++;
    if (v < 70) dark++;
    if (v < 110 && sa < 120) blemish++;
    const a = labA[p];
    labSum += a;
    labSumSq += a * a;
  }

  const meanA = labSum / validPixels;
  const varianceLab = labSumSq / validPixels - meanA * meanA;
  const colorConsistency = Math.sqrt(Math.max(0, varianceLab));

  const gw = w;
  const gh = h;
  const lap = new Float64Array(gw * gh);
  for (let y = 1; y < gh - 1; y++) {
    for (let x = 1; x < gw - 1; x++) {
      const p = y * gw + x;
      const c = gray[p];
      const nbr =
        gray[p - gw] + gray[p + gw] + gray[p - 1] + gray[p + 1];
      lap[p] = nbr - 4 * c;
    }
  }
  let lapSum = 0;
  let lapSumSq = 0;
  for (let p = 0; p < gw * gh; p++) {
    lapSum += lap[p];
    lapSumSq += lap[p] * lap[p];
  }
  const lapMean = lapSum / (gw * gh);
  const roughness = lapSumSq / (gw * gh) - lapMean * lapMean;

  const edges = cannyEdges(gray, gw, gh, 100, 200);
  let edgeCount = 0;
  for (let p = 0; p < edges.length; p++) {
    if (edges[p]) edgeCount++;
  }
  const edgeDensity = edgeCount / (gw * gh);

  let gSum = 0;
  let gSumSq = 0;
  for (let p = 0; p < gray.length; p++) {
    gSum += gray[p];
    gSumSq += gray[p] * gray[p];
  }
  const gMean = gSum / gray.length;
  const grayVariance = gSumSq / gray.length - gMean * gMean;

  return {
    yellow_ratio: yellow / validPixels,
    green_ratio: green / validPixels,
    dark_spot_ratio: dark / validPixels,
    blemish_ratio: blemish / validPixels,
    color_consistency: colorConsistency,
    roughness,
    edge_density: edgeDensity,
    gray_variance: grayVariance,
  };
}

function gaussianBlur5(gray, w, h) {
  const k = [1, 4, 6, 4, 1];
  const norm = 16;
  const tmp = new Float64Array(w * h);
  const out = new Float64Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let i = -2; i <= 2; i++) {
        const xx = Math.min(w - 1, Math.max(0, x + i));
        s += k[i + 2] * gray[y * w + xx];
      }
      tmp[y * w + x] = s / norm;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let i = -2; i <= 2; i++) {
        const yy = Math.min(h - 1, Math.max(0, y + i));
        s += k[i + 2] * tmp[yy * w + x];
      }
      out[y * w + x] = s / norm;
    }
  }
  return out;
}

function cannyEdges(gray, w, h, lowThresh, highThresh) {
  const blurred = gaussianBlur5(gray, w, h);
  const gx = new Float64Array(w * h);
  const gy = new Float64Array(w * h);
  const mag = new Float64Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x;
      const a = blurred[p - w - 1];
      const b = blurred[p - w];
      const c = blurred[p - w + 1];
      const d = blurred[p - 1];
      const f = blurred[p + 1];
      const g = blurred[p + w - 1];
      const h0 = blurred[p + w];
      const i0 = blurred[p + w + 1];
      const gxv = -a + c - 2 * d + 2 * f - g + i0;
      const gyv = a + 2 * b + c - g - 2 * h0 - i0;
      gx[p] = gxv;
      gy[p] = gyv;
      mag[p] = Math.abs(gxv) + Math.abs(gyv);
    }
  }
  const nms = new Float64Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x;
      const m = mag[p];
      const ang = (Math.atan2(gy[p], gx[p]) * 180) / Math.PI;
      const a = ang < 0 ? ang + 180 : ang;
      let q = 255;
      let r = 255;
      if ((a >= 0 && a < 22.5) || (a >= 157.5 && a <= 180)) {
        q = mag[p + 1];
        r = mag[p - 1];
      } else if (a >= 22.5 && a < 67.5) {
        q = mag[p - w + 1];
        r = mag[p + w - 1];
      } else if (a >= 67.5 && a < 112.5) {
        q = mag[p - w];
        r = mag[p + w];
      } else if (a >= 112.5 && a < 157.5) {
        q = mag[p - w - 1];
        r = mag[p + w + 1];
      }
      nms[p] = m >= q && m >= r ? m : 0;
    }
  }
  const STRONG = 2;
  const WEAK = 1;
  const res = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) {
    if (nms[p] >= highThresh) res[p] = STRONG;
    else if (nms[p] >= lowThresh) res[p] = WEAK;
    else res[p] = 0;
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const p = y * w + x;
        if (res[p] !== WEAK) continue;
        let adjStrong = false;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (res[p + dy * w + dx] === STRONG) adjStrong = true;
          }
        }
        if (adjStrong) {
          res[p] = STRONG;
          changed = true;
        }
      }
    }
  }
  const bin = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) bin[p] = res[p] === STRONG ? 1 : 0;
  return bin;
}

function classicalToFloat32Row(classical) {
  const row = new Float32Array(8);
  for (let i = 0; i < FEATURE_ORDER.length; i++) {
    row[i] = classical[FEATURE_ORDER[i]];
  }
  return row;
}

/**
 * Resize (bilinear) + center crop + normalize → NCHW float32 length 3*size*size
 */
async function rgbToModelNchw(rgb, w, h, imageSize, mean, std) {
  const { data, info } = await sharp(Buffer.from(rgb), {
    raw: { width: w, height: h, channels: 3 },
  })
    .resize(imageSize, imageSize, { fit: "fill", kernel: sharp.kernel.linear })
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (info.width !== imageSize || info.height !== imageSize) {
    throw new Error(`Expected ${imageSize}x${imageSize} after preprocess, got ${info.width}x${info.height}`);
  }

  const ch = info.channels;
  const floatHw = new Float32Array(imageSize * imageSize * 3);
  for (let i = 0, p = 0; i < data.length; i += ch, p++) {
    floatHw[p * 3] = data[i] / 255;
    floatHw[p * 3 + 1] = data[i + 1] / 255;
    floatHw[p * 3 + 2] = data[i + 2] / 255;
  }

  const tensorData = new Float32Array(3 * imageSize * imageSize);
  let idx = 0;
  for (let c = 0; c < 3; c++) {
    for (let y = 0; y < imageSize; y++) {
      for (let x = 0; x < imageSize; x++) {
        const p = y * imageSize + x;
        const v = floatHw[p * 3 + c];
        tensorData[idx++] = (v - mean[c]) / std[c];
      }
    }
  }
  return tensorData;
}

/**
 * Load RGB from buffer, optional cleanup per config.
 */
async function prepareCleanedRgbFromBuffer(imageBuffer, config) {
  const { data, info } = await sharp(imageBuffer)
    .ensureAlpha()
    .flatten({ background: { r: 0, g: 0, b: 0 } })
    .raw()
    .toBuffer({ resolveWithObject: true });

  let rgb;
  if (info.channels === 3) {
    rgb = new Uint8Array(data);
  } else if (info.channels === 4) {
    const w = info.width;
    const h = info.height;
    rgb = new Uint8Array(w * h * 3);
    for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
      rgb[j] = data[i];
      rgb[j + 1] = data[i + 1];
      rgb[j + 2] = data[i + 2];
    }
  } else {
    throw new Error(`Expected 3 or 4 channels, got ${info.channels}`);
  }

  const width = info.width;
  const height = info.height;
  let w = width;
  let h = height;

  const prep = config.preprocessing;
  if (prep.use_background_cleanup) {
    const cleaned = cleanupBackground(rgb, w, h, prep.use_crop_refinement);
    rgb = cleaned.rgb;
    w = cleaned.w;
    h = cleaned.h;
  }

  return { rgb, width: w, height: h };
}

module.exports = {
  FEATURE_ORDER,
  loadMangoGradingConfigSync,
  prepareCleanedRgbFromBuffer,
  cleanupBackground,
  computeClassicalFeatures,
  classicalToFloat32Row,
  rgbToModelNchw,
};
