"""Give an optimized character the standard skeleton, skin it, and bake idle / walk / run from the free animation files."""
import json, struct, io, os, sys, numpy as np
from collections import defaultdict
from glbload import GLB
import anim_src as A

NAMES = ['Hips', 'Spine', 'Chest', 'Neck', 'Head', 'UpperArm_L', 'LowerArm_L', 'Hand_L', 'UpperArm_R', 'LowerArm_R', 'Hand_R',
         'UpperLeg_L', 'LowerLeg_L', 'Foot_L', 'UpperLeg_R', 'LowerLeg_R', 'Foot_R']
PARENT = [-1, 0, 1, 2, 3, 2, 5, 6, 2, 8, 9, 0, 11, 12, 0, 14, 15]
NB = len(NAMES); IX = {n: i for i, n in enumerate(NAMES)}

# ---------------- quaternions (x, y, z, w) ----------------
def qmul(a, b):
    x1, y1, z1, w1 = a[..., 0], a[..., 1], a[..., 2], a[..., 3]; x2, y2, z2, w2 = b[..., 0], b[..., 1], b[..., 2], b[..., 3]
    return np.stack([w1*x2 + x1*w2 + y1*z2 - z1*y2, w1*y2 - x1*z2 + y1*w2 + z1*x2, w1*z2 - x1*y2 + y1*x2 + z1*w2, w1*w2 - x1*x2 - y1*y2 - z1*z2], -1)
def qinv(a): return a * np.array([-1, -1, -1, 1.0])
def qnorm(a): return a / np.linalg.norm(a, axis=-1, keepdims=True)
def qaim(a, b):
    """rotation taking unit vector(s) a to unit vector(s) b by the shortest turn"""
    a = np.broadcast_to(a, b.shape)
    c = np.cross(a, b); d = (a * b).sum(-1, keepdims=True)
    q = np.concatenate([c, 1 + d], -1)
    bad = (1 + d[..., 0]) < 1e-6
    if bad.any():
        q[bad] = np.array([0, 0, 1, 0]) if False else np.array([1, 0, 0, 0])
    return qnorm(q)
def qrot(q, v):
    qv = q[..., :3]; w = q[..., 3:4]
    t = 2 * np.cross(qv, v)
    return v + w * t + np.cross(qv, t)
def unit(v): return v / (np.linalg.norm(v, axis=-1, keepdims=True) + 1e-12)

# ---------------- 1. fit the skeleton to the mesh ----------------
def fit_skeleton(P):
    H = float(P[:, 1].max()); J = {}
    def sl(y0, y1, xr=None, side=None):
        m = (P[:, 1] >= y0 * H) & (P[:, 1] < y1 * H)
        if xr is not None: m &= np.abs(P[:, 0]) < xr * H
        if side: m &= side * P[:, 0] > 0.02 * H
        return P[m]
    zc = lambda y0, y1, xr=0.09: float(sl(y0, y1, xr)[:, 2].mean()) if len(sl(y0, y1, xr)) else 0.0
    J['Hips'] = np.array([0, 0.523 * H, zc(0.50, 0.56, 0.15)])
    J['Spine'] = np.array([0, 0.600 * H, zc(0.58, 0.62)])
    J['Chest'] = np.array([0, 0.709 * H, zc(0.69, 0.73)])
    J['Neck'] = np.array([0, 0.814 * H, zc(0.80, 0.83, 0.05)])
    J['Head'] = np.array([0, 0.855 * H, zc(0.84, 0.88, 0.07)])
    info = {}
    for s, side in (('L', 1), ('R', -1)):
        calf = sl(0.15, 0.24, None, side); lx = float(calf[:, 0].mean()); lz = float(calf[:, 2].mean())
        ank = sl(0.065, 0.10, None, side); ax = float(ank[:, 0].mean())
        J['UpperLeg_' + s] = np.array([lx * 0.95, 0.523 * H - 0.035 * H, lz])
        J['LowerLeg_' + s] = np.array([lx, 0.275 * H, lz])
        J['Foot_' + s] = np.array([ax, 0.050 * H, lz])
        S = np.array([side * 0.105 * H, 0.775 * H, J['Chest'][2]])
        cand = P[(side * P[:, 0] > 0.14 * H) & (P[:, 1] > 0.35 * H)]
        d = np.linalg.norm(cand - S, axis=1); tip = cand[d.argmax()]; L = float(d.max())
        info['arm_len_' + s] = L / H
        if not (0.36 * H < L < 0.58 * H):
            L = 0.46 * H; tip = S + unit(tip - S) * L
        dr = unit(tip - S)
        J['UpperArm_' + s] = S; J['LowerArm_' + s] = S + dr * 0.45 * L; J['Hand_' + s] = S + dr * 0.82 * L
        info['tip_' + s] = tip
    J = np.array([J[n] for n in NAMES])
    toe = {s: J[IX['Foot_' + s]] + np.array([0, -0.025 * H, 0.07 * H]) for s in 'LR'}
    return J, H, info, toe

# ---------------- 2. skin weights ----------------
def seg_dist(p, a, b):
    ab = b - a; t = np.clip(((p - a) @ ab) / (ab @ ab), 0, 1)
    return np.linalg.norm(p - (a + t[:, None] * ab), axis=1)

def skin_weights(prims, J, H, toe):
    k = H / 1.72
    Y = lambda f: f * H
    segs = [('Hips', np.array([0, Y(.477), J[0][2]]), np.array([0, Y(.581), J[0][2]]), .10 * H),
            ('Spine', np.array([0, Y(.581), J[1][2]]), np.array([0, Y(.709), J[2][2]]), .087 * H),
            ('Chest', np.array([0, Y(.709), J[2][2]]), np.array([0, Y(.814), J[3][2]]), .10 * H),
            ('Neck', J[3], J[4], .035 * H), ('Head', J[4], J[4] + np.array([0, .122 * H, 0]), .07 * H)]
    for s in 'LR':
        tipk = None
        segs += [('UpperArm_' + s, J[IX['UpperArm_' + s]], J[IX['LowerArm_' + s]], .032 * H),
                 ('LowerArm_' + s, J[IX['LowerArm_' + s]], J[IX['Hand_' + s]], .029 * H),
                 ('Hand_' + s, J[IX['Hand_' + s]], J[IX['Hand_' + s]] + unit(J[IX['Hand_' + s]] - J[IX['LowerArm_' + s]]) * .10 * H, .029 * H),
                 ('UpperLeg_' + s, J[IX['UpperLeg_' + s]], J[IX['LowerLeg_' + s]], .055 * H),
                 ('LowerLeg_' + s, J[IX['LowerLeg_' + s]], J[IX['Foot_' + s]], .038 * H),
                 ('Foot_' + s, J[IX['Foot_' + s]], toe[s], .038 * H)]
    allP = np.concatenate([p['pos'] for p in prims])
    key = np.round(allP * 1e4).astype(np.int64)
    _, first, inv = np.unique(key, axis=0, return_index=True, return_inverse=True); inv = inv.reshape(-1)
    G = len(first); GP = allP[first]
    cost = np.stack([seg_dist(GP, a, b) / r for (_, a, b, r) in segs], 1)
    owner = np.array([IX[segs[i][0]] for i in cost.argmin(1)])
    owner[(GP[:, 1] > 0.835 * H) & (np.abs(GP[:, 0]) < 0.13 * H)] = IX['Head']
    low = GP[:, 1] < 0.065 * H
    owner[low & (GP[:, 0] > 0)] = IX['Foot_L']; owner[low & (GP[:, 0] <= 0)] = IX['Foot_R']
    W = np.zeros((G, NB)); W[np.arange(G), owner] = 1
    nb = defaultdict(set); off = 0
    for p in prims:
        for t in p['idx']:
            a, b, c = inv[t + off]; nb[a].update((b, c)); nb[b].update((a, c)); nb[c].update((a, b))
        off += len(p['pos'])
    rows = np.array([v for v, s in nb.items() for u in s]); cols = np.array([u for v, s in nb.items() for u in s])
    deg = np.bincount(rows, minlength=G).astype(float); deg[deg == 0] = 1
    for _ in range(16):
        acc = np.zeros_like(W); np.add.at(acc, rows, W[cols]); W = 0.4 * W + 0.6 * acc / deg[:, None]
    top = np.argsort(-W, 1)[:, :4]; Wk = np.take_along_axis(W, top, 1); Wk /= Wk.sum(1, keepdims=True)
    return top.astype(np.uint8)[inv], Wk.astype(np.float32)[inv]

# ---------------- 3. retarget animation ----------------
SRC = {
    'male': dict(idle='male/idle_2_male_free_animation_220_frames_loop', walk='male/male_basic_walk_30_frames_loop', run='male/male_jogging_30_frames_loop'),
    'female': dict(idle='female/female_idle_1_free_animation_150_frames_loop', walk='female/basic_walk_free_animation_30_frames_loop', run='female/female_jogging_free_animation_30_frames_loop'),
}
def retarget(clip, J, toe, src_stand_y, tgt_hip_y, scale):
    p = clip['pos']; F = clip['F']
    # drop the repeated last frame of looping clips
    if np.allclose(p['pelvis'][0], p['pelvis'][-1], atol=1e-3) and np.allclose(p['L_foot'][0], p['L_foot'][-1], atol=1e-3): F -= 1
    sl = slice(0, F); P = {k: v[sl] for k, v in p.items()}
    Wq = np.zeros((NB, F, 4)); Wq[..., 3] = 1
    # hips: how much the pelvis turned compared to its average
    q = clip['rot']['pelvis'][sl].copy()
    q *= np.sign((q * q[0]).sum(-1, keepdims=True)); mean = qnorm(q.mean(0, keepdims=True))
    Wq[IX['Hips']] = qnorm(qmul(q, qinv(mean)))
    def aim(bone, a_key, b_key, rest_dir):
        Wq[IX[bone]] = qaim(unit(rest_dir), unit(P[b_key] - P[a_key]))
    rest = lambda a, b: unit(J[IX[b]] - J[IX[a]])
    aim('Spine', 'spine', 'spine1', rest('Spine', 'Chest'))
    aim('Chest', 'spine1', 'neck', rest('Chest', 'Neck'))
    aim('Neck', 'neck', 'head', rest('Neck', 'Head'))
    Wq[IX['Head']] = Wq[IX['Neck']]
    for s in 'LR':
        aim('UpperArm_' + s, s + '_upper', s + '_fore', rest('UpperArm_' + s, 'LowerArm_' + s))
        aim('LowerArm_' + s, s + '_fore', s + '_hand', rest('LowerArm_' + s, 'Hand_' + s))
        Wq[IX['Hand_' + s]] = Wq[IX['LowerArm_' + s]]
        aim('UpperLeg_' + s, s + '_thigh', s + '_calf', rest('UpperLeg_' + s, 'LowerLeg_' + s))
        aim('LowerLeg_' + s, s + '_calf', s + '_foot', rest('LowerLeg_' + s, 'Foot_' + s))
        Wq[IX['Foot_' + s]] = qaim(unit(toe[s] - J[IX['Foot_' + s]]), unit(P[s + '_toe'] - P[s + '_foot']))
    loc = np.zeros((NB, F, 4))
    for b in range(NB):
        loc[b] = Wq[b] if PARENT[b] < 0 else qmul(qinv(Wq[PARENT[b]]), Wq[b])
    loc = qnorm(loc)
    pel = P['pelvis']
    hip = np.zeros((F, 3))
    hip[:, 0] = J[0][0] + (pel[:, 0] - pel[:, 0].mean()) * scale
    hip[:, 2] = J[0][2] + (pel[:, 2] - pel[:, 2].mean()) * scale
    hip[:, 1] = tgt_hip_y + (pel[:, 1] - src_stand_y) * scale
    return loc, hip, F

def foot_speed(clip):
    """rough speed (m/s) the animation was made for: how fast the planted foot slides back"""
    p = clip['pos']; F = clip['F'] - 1
    z = p['L_foot'][:F, 2] - p['pelvis'][:F, 2]
    dur = float(clip['times'][F]) if F < len(clip['times']) else clip['F'] / 30.0
    return float(np.ptp(z) / (0.6 * dur))

# ---------------- 4. FK + skinning (for the checks) ----------------
def fk(loc_f, hip_f, J):
    """world rotation and position of every bone for one frame"""
    Wq = np.zeros((NB, 4)); Wp = np.zeros((NB, 3))
    for b in range(NB):
        if PARENT[b] < 0: Wq[b] = loc_f[b]; Wp[b] = hip_f
        else:
            Wq[b] = qmul(Wq[PARENT[b]], loc_f[b]); Wp[b] = Wp[PARENT[b]] + qrot(Wq[PARENT[b]], J[b] - J[PARENT[b]])
    return Wq, Wp

def skin_pose(pos, jn, wt, J, loc_f, hip_f):
    Wq, Wp = fk(loc_f, hip_f, J)
    out = np.zeros_like(pos)
    for k in range(4):
        b = jn[:, k]; w = wt[:, k:k+1]
        rel = pos - J[b]
        out += w * (Wp[b] + qrot(Wq[b], rel))
    return out
