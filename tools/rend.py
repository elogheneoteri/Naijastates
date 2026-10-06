import numpy as np
from PIL import Image

def rotate(prims, yaw_deg):
    t = np.radians(yaw_deg); R = np.array([[np.cos(t), 0, np.sin(t)], [0, 1, 0], [-np.sin(t), 0, np.cos(t)]])
    return R

def render(prims, yaw=0, W=360, H=720, bg=(210, 214, 220), bounds=None, up='y'):
    allp = np.concatenate([p['pos'] for p in prims])
    if bounds is None: bounds = (allp.min(0), allp.max(0))
    lo, hi = bounds; c = (lo + hi) / 2; h = hi[1] - lo[1]
    R = rotate(prims, yaw)
    s = min(H * 0.92 / h, W * 0.92 / max(hi[0] - lo[0], hi[2] - lo[2], 1e-6))
    img = np.zeros((H, W, 3), np.float32); img[:] = bg
    zb = np.full((H, W), -1e18)
    light = np.array([0.35, 0.55, 0.75]); light /= np.linalg.norm(light)
    for p in prims:
        X = (p['pos'] - c) @ R.T
        sx = X[:, 0] * s + W / 2; sy = H / 2 - (X[:, 1] - (0)) * s + 0; sy = H * 0.96 - (p['pos'][:, 1] - lo[1]) * s
        z = X[:, 2]
        I = p['idx']; tex = p['tex']; col = p['color']
        a = X[I[:, 0]]; b = X[I[:, 1]]; cc = X[I[:, 2]]
        fn = np.cross(b - a, cc - a); fl = np.linalg.norm(fn, axis=1) + 1e-20; fn /= fl[:, None]
        lam = np.abs(fn @ light) * 0.6 + 0.4
        # camera is at +z looking -z; flip normals that face away so both sides shade
        uv = p['uv']; mask_alpha = p['alpha'] != 'OPAQUE'
        th, tw = (tex.shape[:2] if tex is not None else (1, 1))
        x0 = sx[I[:, 0]]; x1 = sx[I[:, 1]]; x2 = sx[I[:, 2]]; y0 = sy[I[:, 0]]; y1 = sy[I[:, 1]]; y2 = sy[I[:, 2]]
        bw = np.maximum.reduce([x0, x1, x2]) - np.minimum.reduce([x0, x1, x2]); bh = np.maximum.reduce([y0, y1, y2]) - np.minimum.reduce([y0, y1, y2])
        small = (bw < 1.6) & (bh < 1.6)
        def sample(u, v):
            u = np.mod(u, 1.0); v = np.mod(v, 1.0)
            if tex is None:
                return np.tile(col[:3] * 255, (np.size(u), 1)).reshape(np.shape(u) + (3,)), np.ones(np.shape(u))
            px = np.clip((u * tw).astype(int), 0, tw - 1); py = np.clip((v * th).astype(int), 0, th - 1)
            t = tex[py, px].astype(np.float32)
            rgb = t[..., :3] * col[:3]; al = t[..., 3] / 255.0 * col[3]
            return rgb, al
        # small triangles: splat centroid
        si = np.where(small)[0]
        if len(si):
            cx = ((x0 + x1 + x2) / 3)[si].astype(int); cy = ((y0 + y1 + y2) / 3)[si].astype(int)
            cz = ((X[I[:, 0], 2] + X[I[:, 1], 2] + X[I[:, 2], 2]) / 3)[si]
            u = ((uv[I[:, 0], 0] + uv[I[:, 1], 0] + uv[I[:, 2], 0]) / 3)[si]; v = ((uv[I[:, 0], 1] + uv[I[:, 1], 1] + uv[I[:, 2], 1]) / 3)[si]
            ok = (cx >= 0) & (cx < W) & (cy >= 0) & (cy < H)
            rgb, al = sample(u, v)
            if mask_alpha: ok &= al > p['cutoff']
            order = np.argsort(cz)                       # nearer last wins
            for k in order:
                if ok[k] and cz[k] > zb[cy[k], cx[k]]:
                    zb[cy[k], cx[k]] = cz[k]; img[cy[k], cx[k]] = np.clip(rgb[k] * lam[si[k]], 0, 255)
        for t in np.where(~small)[0]:
            ax, ay, bx, by, cx_, cy_ = x0[t], y0[t], x1[t], y1[t], x2[t], y2[t]
            area = (bx - ax) * (cy_ - ay) - (cx_ - ax) * (by - ay)
            if abs(area) < 1e-9: continue
            minx = int(max(0, np.floor(min(ax, bx, cx_)))); maxx = int(min(W - 1, np.ceil(max(ax, bx, cx_))))
            miny = int(max(0, np.floor(min(ay, by, cy_)))); maxy = int(min(H - 1, np.ceil(max(ay, by, cy_))))
            if minx > maxx or miny > maxy: continue
            xs, ys = np.meshgrid(np.arange(minx, maxx + 1) + 0.5, np.arange(miny, maxy + 1) + 0.5)
            w0 = ((bx - xs) * (cy_ - ys) - (cx_ - xs) * (by - ys)) / area
            w1 = ((cx_ - xs) * (ay - ys) - (ax - xs) * (cy_ - ys)) / area
            w2 = 1 - w0 - w1
            m = (w0 >= 0) & (w1 >= 0) & (w2 >= 0)
            if not m.any(): continue
            i0, i1, i2 = I[t]
            zz = w0 * X[i0, 2] + w1 * X[i1, 2] + w2 * X[i2, 2]
            sub = zb[miny:maxy + 1, minx:maxx + 1]
            m &= zz > sub
            if not m.any(): continue
            u = w0 * uv[i0, 0] + w1 * uv[i1, 0] + w2 * uv[i2, 0]; v = w0 * uv[i0, 1] + w1 * uv[i1, 1] + w2 * uv[i2, 1]
            rgb, al = sample(u, v)
            if mask_alpha: m &= al > p['cutoff']
            if not m.any(): continue
            sub[m] = zz[m]
            reg = img[miny:maxy + 1, minx:maxx + 1]; reg[m] = np.clip(rgb[m] * lam[t], 0, 255)
    return Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))
