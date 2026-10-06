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
    return np.stack([w1*x2 + x1*w2 + y1*z2 - z1*y2, w1*y2 - x1*z2 + y1*w2 + z1*x2, w1*z2 + x1*y2 - y1*x2 + z1*w2, w1*w2 - x1*x2 - y1*y2 - z1*z2], -1)
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
SHOULDER_X, SHOULDER_Y = 0.085, 0.775
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
        S = np.array([side * SHOULDER_X * H, SHOULDER_Y * H, J['Chest'][2]])
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

ARM_SOFT = 0.6
APOSE_DEG = 35   # arms of the mesh are lowered this much from the T-pose (0 = keep T-pose)
ARM_IN = 0.03
def skin_weights(prims, J, H, toe):
    """Weights depend ONLY on where a point is in space (distance to each bone), so a shirt, the skin under it and a
    skirt at the same spot always move together - nothing can poke through or tear open."""
    Y = lambda f: f * H
    segs = [('Hips', np.array([0, Y(.477), J[0][2]]), np.array([0, Y(.581), J[0][2]]), .10 * H),
            ('Spine', np.array([0, Y(.581), J[1][2]]), np.array([0, Y(.709), J[2][2]]), .087 * H),
            ('Chest', np.array([0, Y(.709), J[2][2]]), np.array([0, Y(.814), J[3][2]]), .10 * H),
            ('Neck', J[3], J[4], .035 * H), ('Head', J[4], J[4] + np.array([0, .122 * H, 0]), .07 * H)]
    for s in 'LR':
        segs += [('UpperArm_' + s, J[IX['UpperArm_' + s]] - unit(J[IX['LowerArm_' + s]] - J[IX['UpperArm_' + s]]) * ARM_IN * H, J[IX['LowerArm_' + s]], .050 * H),
                 ('LowerArm_' + s, J[IX['LowerArm_' + s]], J[IX['Hand_' + s]], .045 * H),
                 ('Hand_' + s, J[IX['Hand_' + s]], J[IX['Hand_' + s]] + unit(J[IX['Hand_' + s]] - J[IX['LowerArm_' + s]]) * .12 * H, .045 * H),
                 ('UpperLeg_' + s, J[IX['UpperLeg_' + s]], J[IX['LowerLeg_' + s]], .055 * H),
                 ('LowerLeg_' + s, J[IX['LowerLeg_' + s]], J[IX['Foot_' + s]], .038 * H),
                 ('Foot_' + s, J[IX['Foot_' + s]], toe[s], .038 * H)]
    allP = np.concatenate([p['pos'] for p in prims])
    cost = np.stack([seg_dist(allP, a, b) / r for (_, a, b, r) in segs], 1)
    col = np.array([IX[n] for (n, *_ ) in segs])
    W = np.zeros((len(allP), NB))
    T = np.array([ARM_SOFT if n.startswith('UpperArm') else 0.22 for (n, *_ ) in segs])
    soft = np.exp(-(cost - cost.min(1, keepdims=True)) / T)
    soft[soft < 0.03] = 0
    for k in range(len(segs)): W[:, col[k]] += soft[:, k]
    # the head and everything above the neck is the head; feet are the feet
    head = (allP[:, 1] > 0.835 * H) & (np.abs(allP[:, 0]) < 0.13 * H)
    W[head] = 0; W[head, IX['Head']] = 1
    low = allP[:, 1] < 0.045 * H
    near_L = np.linalg.norm(allP[:, [0, 2]] - J[IX['Foot_L']][[0, 2]], axis=1) < np.linalg.norm(allP[:, [0, 2]] - J[IX['Foot_R']][[0, 2]], axis=1)
    W[low] = 0; W[low & near_L, IX['Foot_L']] = 1; W[low & ~near_L, IX['Foot_R']] = 1
    top = np.argsort(-W, 1)[:, :4]; Wk = np.take_along_axis(W, top, 1); Wk /= Wk.sum(1, keepdims=True)
    return top.astype(np.uint8), Wk.astype(np.float32)

# ---------------- 3. retarget animation ----------------
SRC = {
    # 'hold:' = no suitable standing clip exists, so make a calm one from the feet-together moment of the walk, plus slow breathing
    'male': dict(idle='hold:male/male_basic_walk_30_frames_loop', walk='male/male_basic_walk_30_frames_loop', run='male/male_jogging_30_frames_loop'),
    'female': dict(idle='female/idle_female_free_animation_190_frames_loop', walk='female/basic_walk_free_animation_30_frames_loop', run='female/female_jogging_free_animation_30_frames_loop'),
}
KEY = {'Hips': 'pelvis', 'Spine': 'spine', 'Chest': 'spine1', 'Neck': 'neck', 'Head': 'head'}
for _s in 'LR':
    KEY.update({'UpperArm_' + _s: _s + '_upper', 'LowerArm_' + _s: _s + '_fore', 'Hand_' + _s: _s + '_hand',
                'UpperLeg_' + _s: _s + '_thigh', 'LowerLeg_' + _s: _s + '_calf', 'Foot_' + _s: _s + '_foot'})
# how much of the source's head / neck / spine movement to keep (1 = all). Lower = calmer posture.
DAMP = {'Neck': 0.6, 'Head': 0.6}

def slerp_to_identity(q, amount):
    """keep only `amount` of rotation q (q is [..., 4] x,y,z,w)"""
    q = q * np.where(q[..., 3:4] < 0, -1, 1)
    ang = 2 * np.arccos(np.clip(q[..., 3], -1, 1)); ax = q[..., :3]
    n = np.linalg.norm(ax, axis=-1, keepdims=True); ax = ax / np.maximum(n, 1e-9)
    h = ang * amount / 2
    return np.concatenate([ax * np.sin(h)[..., None], np.cos(h)[..., None]], -1)

def retarget(clip, J, toe, src_stand_y, tgt_hip_y, scale):
    """Per-bone rotation retarget. Both skeletons are in a T-pose at rest, so each bone just copies how far the source
    bone has turned away from ITS T-pose (twist included). Bone lengths come from the character, never from the clip."""
    p = clip['pos']; F = clip['F']
    if np.allclose(p['pelvis'][0], p['pelvis'][-1], atol=1e-3) and np.allclose(p['L_foot'][0], p['L_foot'][-1], atol=1e-3): F -= 1
    sl = slice(0, F); P = {k: v[sl] for k, v in p.items()}
    Wq = np.zeros((NB, F, 4)); Wq[..., 3] = 1
    LIMB_DIR = {}
    for s in 'LR':
        LIMB_DIR['UpperArm_' + s] = ('UpperArm_' + s, 'LowerArm_' + s); LIMB_DIR['LowerArm_' + s] = ('LowerArm_' + s, 'Hand_' + s)
        LIMB_DIR['Hand_' + s] = ('LowerArm_' + s, 'Hand_' + s)
        LIMB_DIR['UpperLeg_' + s] = ('UpperLeg_' + s, 'LowerLeg_' + s); LIMB_DIR['LowerLeg_' + s] = ('LowerLeg_' + s, 'Foot_' + s)
    for bone, key in KEY.items():
        D = qmul(clip['rot'][key][sl], qinv(clip['bind'][key])[None])       # world turn away from T-pose
        D = qnorm(D)
        if bone in LIMB_DIR:
            # this character's limb may not rest exactly where the source's does (arms already lowered, legs apart):
            # first turn the character's own limb onto the source's T-pose direction, then apply the source's movement
            a, b2 = LIMB_DIR[bone]; d_t = unit(J[IX[b2]] - J[IX[a]])
            d_s = A.quat_to_mat(clip['bind'][key])[:, 0]
            C = qaim(d_t, unit(d_s))
            D = qnorm(qmul(D, C[None]))
        Wq[IX[bone]] = D
    loc = np.zeros((NB, F, 4))
    for b in range(NB):
        loc[b] = Wq[b] if PARENT[b] < 0 else qmul(qinv(Wq[PARENT[b]]), Wq[b])
    loc = qnorm(loc)
    for n, a in DAMP.items(): loc[IX[n]] = slerp_to_identity(loc[IX[n]], a)
    for b in range(NB):                                                    # no sign flips between frames
        for f in range(1, F):
            if (loc[b, f] * loc[b, f - 1]).sum() < 0: loc[b, f] *= -1
    pel = P['pelvis']
    hip = np.zeros((F, 3))
    hip[:, 0] = J[0][0] + (pel[:, 0] - pel[:, 0].mean()) * scale
    hip[:, 2] = J[0][2] + (pel[:, 2] - pel[:, 2].mean()) * scale
    hip[:, 1] = tgt_hip_y + (pel[:, 1] - src_stand_y) * scale
    # keep the feet on the ground: lift the whole clip so the lowest ankle never goes below its standing height
    low = 1e9
    for f in range(F):
        Wr, Wp = fk(loc[:, f], hip[f], J)
        for s in 'LR':
            i = IX['Foot_' + s]; low = min(low, Wp[i][1] - J[i][1])
    hip[:, 1] -= min(low, 0) if low < -0.0 else 0
    return loc, hip, F

UPPER = ['spine', 'spine1', 'neck', 'head', 'L_upper', 'L_fore', 'L_hand', 'R_upper', 'R_fore', 'R_hand']
def make_hold_idle(clip, seconds=4.0, fps=30):
    """a relaxed standing clip: the walk frame where the feet are closest, held, with a slow breath in the upper body"""
    F = clip['F'] - 1; p = clip['pos']
    sep = np.linalg.norm((p['L_foot'][:F] - p['R_foot'][:F])[:, [0, 2]], axis=1)
    k = int(np.argmin(sep)); N = int(seconds * fps)
    t = np.arange(N) / fps; ph = np.sin(2 * np.pi * t / seconds)
    out = dict(times=t.astype(np.float32), F=N + 1, bind=clip['bind'], pos={}, rot={})
    for key in p:
        out['pos'][key] = np.tile(p[key][k], (N + 1, 1)); out['rot'][key] = np.tile(clip['rot'][key][k], (N + 1, 1))
    ph = np.append(ph, ph[0]); out['times'] = np.append(t, seconds).astype(np.float32)
    out['pos']['pelvis'] = out['pos']['pelvis'] + np.stack([0 * ph, 0.004 * ph, 0 * ph], 1)
    a = 0.016 * ph                                                  # about 1 degree of chest rise
    dq = np.stack([np.sin(a / 2), 0 * a, 0 * a, np.cos(a / 2)], 1)   # pitch about the left-right axis
    for key in UPPER:
        if key in out['rot']:
            w = 1.0 if key in ('spine', 'spine1') else (0.6 if key in ('neck', 'head') else 0.5)
            dqw = np.stack([np.sin(a * w / 2), 0 * a, 0 * a, np.cos(a * w / 2)], 1)
            out['rot'][key] = qmul(dqw, out['rot'][key])
    return out

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
