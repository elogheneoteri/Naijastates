import struct, json, io, numpy as np
from collections import defaultdict

SRC = '/home/claude/camp/char/out/player_female_01.glb'
OUT = '/home/claude/rig/player_female_01.glb'

d = open(SRC, 'rb').read(); l = struct.unpack('<I', d[12:16])[0]; J = json.loads(d[20:20+l]); B = d[20+l+8:]
def acc(i, dt, n):
    a = J['accessors'][i]; bv = J['bufferViews'][a['bufferView']]
    return np.frombuffer(B, dt, a['count']*n, bv['byteOffset']).reshape(-1, n)
P = acc(0, np.float32, 3).copy(); N = acc(1, np.float32, 3).copy(); UV = acc(2, np.float32, 2).copy()
I = acc(3, np.uint16, 1).reshape(-1, 3).astype(np.int64)
images = []
for im in J['images']:
    bv = J['bufferViews'][im['bufferView']]
    images.append((im['name'], B[bv['byteOffset']:bv['byteOffset']+bv['byteLength']]))
material = J['materials'][0]

# ---------------- skeleton (rest pose, all joint rotations are identity) ----------------
bones = [  # name, parent, joint position
    ('Hips', -1, (0, 0.90, 0)), ('Spine', 0, (0, 1.03, 0)), ('Chest', 1, (0, 1.22, 0)),
    ('Neck', 2, (0, 1.40, 0)), ('Head', 3, (0, 1.47, 0)),
    ('UpperArm_L', 2, (0.17, 1.32, 0)), ('LowerArm_L', 5, (0.205, 1.07, 0)), ('Hand_L', 6, (0.235, 0.82, 0)),
    ('UpperArm_R', 2, (-0.17, 1.32, 0)), ('LowerArm_R', 8, (-0.205, 1.07, 0)), ('Hand_R', 9, (-0.235, 0.82, 0)),
    ('UpperLeg_L', 0, (0.085, 0.88, 0)), ('LowerLeg_L', 11, (0.085, 0.47, 0)), ('Foot_L', 12, (0.078, 0.085, 0)),
    ('UpperLeg_R', 0, (-0.085, 0.88, 0)), ('LowerLeg_R', 14, (-0.085, 0.47, 0)), ('Foot_R', 15, (-0.078, 0.085, 0)),
]
NB = len(bones)
jp = np.array([b[2] for b in bones], float)
idx = {b[0]: i for i, b in enumerate(bones)}

# capsule segments used to give every vertex a first guess of which bone it belongs to
segs = [  # bone, a, b, radius
    ('Hips', (0, 0.82, 0), (0, 1.00, 0), 0.17), ('Spine', (0, 1.00, 0), (0, 1.22, 0), 0.15),
    ('Chest', (0, 1.22, 0), (0, 1.40, 0), 0.17), ('Neck', (0, 1.40, 0), (0, 1.47, 0), 0.06),
    ('Head', (0, 1.47, 0), (0, 1.68, 0), 0.12),
]
for s, sx in (('L', 1), ('R', -1)):
    segs += [('UpperArm_' + s, (0.17*sx, 1.32, 0), (0.205*sx, 1.07, 0), 0.055),
             ('LowerArm_' + s, (0.205*sx, 1.07, 0), (0.235*sx, 0.82, 0), 0.05),
             ('Hand_' + s, (0.235*sx, 0.82, 0), (0.22*sx, 0.62, 0), 0.05),
             ('UpperLeg_' + s, (0.085*sx, 0.88, 0), (0.085*sx, 0.47, 0), 0.095),
             ('LowerLeg_' + s, (0.085*sx, 0.47, 0), (0.078*sx, 0.085, 0), 0.065),
             ('Foot_' + s, (0.078*sx, 0.085, 0), (0.078*sx, 0.03, 0.12), 0.065)]

# weld vertices by position (the texture seams duplicate vertices); do the weighting on the welded mesh
key = np.round(P * 1e4).astype(np.int64)
_, first, inv = np.unique(key, axis=0, return_index=True, return_inverse=True)
inv = inv.reshape(-1)
G = len(first); GP = P[first]

def seg_dist(p, a, b):
    a = np.array(a); b = np.array(b); ab = b - a
    t = np.clip(((p - a) @ ab) / (ab @ ab), 0, 1)
    return np.linalg.norm(p - (a + t[:, None] * ab), axis=1)

cost = np.stack([seg_dist(GP, a, b) / r for (_, a, b, r) in segs], 1)
owner = np.array([idx[segs[k][0]] for k in cost.argmin(1)])
# hair and head: everything high up in the middle belongs to the head
owner[(GP[:, 1] > 1.44) & (np.abs(GP[:, 0]) < 0.17)] = idx['Head']
# the feet/ankles: below the ankle height stay on the foot
W = np.zeros((G, NB)); W[np.arange(G), owner] = 1

# neighbours on the welded mesh
nbr = defaultdict(set)
for t in I:
    a, b, c = inv[t]
    nbr[a].update((b, c)); nbr[b].update((a, c)); nbr[c].update((a, b))
rows, cols = [], []
for v, s in nbr.items():
    for u in s: rows.append(v); cols.append(u)
rows = np.array(rows); cols = np.array(cols)
deg = np.bincount(rows, minlength=G).astype(float); deg[deg == 0] = 1
def smooth(W, iters, alpha=0.6):
    for _ in range(iters):
        acc_ = np.zeros_like(W)
        np.add.at(acc_, rows, W[cols])
        W = (1 - alpha) * W + alpha * acc_ / deg[:, None]
    return W
W = smooth(W, 14)

# keep the 4 strongest influences
top = np.argsort(-W, 1)[:, :4]
Wk = np.take_along_axis(W, top, 1); Wk /= Wk.sum(1, keepdims=True)
joints_g = top.astype(np.uint8); weights_g = Wk.astype(np.float32)
joints_v = joints_g[inv]; weights_v = weights_g[inv]

# ---------------- animation (rotations about the rest-pose axes) ----------------
def qx(a): return np.array([np.sin(a/2), 0, 0, np.cos(a/2)])
def qy(a): return np.array([0, np.sin(a/2), 0, np.cos(a/2)])
def qz(a): return np.array([0, 0, np.sin(a/2), np.cos(a/2)])
def qmul(a, b):
    x1, y1, z1, w1 = a; x2, y2, z2, w2 = b
    return np.array([w1*x2 + x1*w2 + y1*z2 - z1*y2, w1*y2 - x1*z2 + y1*w2 + z1*x2,
                     w1*z2 - x1*y2 + y1*x2 + z1*w2, w1*w2 - x1*x2 - y1*y2 - z1*z2])
ID = np.array([0, 0, 0, 1.0])

def gait(T, A, K, Bsw, E, bob, lean, twist, n=24):
    """one looping cycle of walking or running"""
    times = np.arange(n + 1) / n * T
    rot = {i: [] for i in range(NB)}; hips_t = []
    for k in range(n + 1):
        ph = 2 * np.pi * k / n
        legs = {}
        for side, sgn in (('L', 0.0), ('R', np.pi)):
            p = ph + sgn
            thigh = -A * np.sin(p)
            knee = K * max(0.0, np.cos(p - 0.35)) ** 1.4 + 0.06
            foot = -(thigh + knee) * 0.6
            legs[side] = (thigh, knee, foot)
        rot[idx['Hips']].append(qy(twist * np.sin(ph)))
        rot[idx['Spine']].append(qmul(qy(-twist * 1.3 * np.sin(ph)), qx(lean * 0.5)))
        rot[idx['Chest']].append(qmul(qy(-twist * 0.7 * np.sin(ph)), qx(lean * 0.5)))
        rot[idx['Neck']].append(qx(-lean * 0.4))
        rot[idx['Head']].append(qmul(qy(twist * 1.2 * np.sin(ph)), qx(-lean * 0.5)))
        for side, sgn in (('L', 0.0), ('R', np.pi)):
            th, kn, ft = legs[side]
            rot[idx['UpperLeg_' + side]].append(qx(th))
            rot[idx['LowerLeg_' + side]].append(qx(kn))
            rot[idx['Foot_' + side]].append(qx(ft))
            arm = Bsw * np.sin(ph + sgn)                    # arm swings opposite to the same-side leg
            out = 0.0
            rot[idx['UpperArm_' + side]].append(qmul(qz((-1 if side == 'L' else 1) * 0.0), qx(arm)))
            rot[idx['LowerArm_' + side]].append(qx(-(E + 0.25 * E * np.sin(ph + sgn + 0.8))))
            rot[idx['Hand_' + side]].append(ID)
        hips_t.append((0, jp[0][1] + bob * (-np.cos(2 * ph)), 0))
    return times, rot, np.array(hips_t)

def idle(T=4.0, n=24):
    times = np.arange(n + 1) / n * T
    rot = {i: [] for i in range(NB)}; hips_t = []
    for k in range(n + 1):
        ph = 2 * np.pi * k / n
        rot[idx['Hips']].append(ID)
        rot[idx['Spine']].append(qx(0.012 * np.sin(ph)))
        rot[idx['Chest']].append(qx(0.02 * np.sin(ph)))
        rot[idx['Neck']].append(qx(-0.012 * np.sin(ph)))
        rot[idx['Head']].append(qmul(qy(0.04 * np.sin(ph)), qx(-0.008 * np.sin(ph))))
        for side, sx in (('L', 1), ('R', -1)):
            rot[idx['UpperArm_' + side]].append(qmul(qz(-sx * 0.015 * np.sin(ph)), qx(0.01 * np.sin(ph + 1))))
            rot[idx['LowerArm_' + side]].append(qx(-0.06 - 0.02 * np.sin(ph)))
            rot[idx['Hand_' + side]].append(ID)
            rot[idx['UpperLeg_' + side]].append(ID); rot[idx['LowerLeg_' + side]].append(ID); rot[idx['Foot_' + side]].append(ID)
        hips_t.append((0, jp[0][1] + 0.004 * np.sin(ph), 0))
    return times, rot, np.array(hips_t)

clips = {
    'idle': idle(),
    'walk': gait(T=1.05, A=0.50, K=0.95, Bsw=0.42, E=0.22, bob=0.018, lean=0.02, twist=0.10),
    'run':  gait(T=0.70, A=0.80, K=1.45, Bsw=0.95, E=1.05, bob=0.040, lean=0.16, twist=0.14),
}

# ---------------- write the glb ----------------
chunks = []; views = []; accessors = []
def add_view(data, target=None):
    while sum(len(c) for c in chunks) % 4: chunks.append(b'\0')
    off = sum(len(c) for c in chunks); chunks.append(bytes(data))
    v = {'buffer': 0, 'byteOffset': off, 'byteLength': len(data)}
    if target: v['target'] = target
    views.append(v); return len(views) - 1
def add_acc(data, ctype, count, typ, target=None, minmax=None):
    a = {'bufferView': add_view(data, target), 'componentType': ctype, 'count': count, 'type': typ}
    if minmax: a['min'], a['max'] = minmax
    accessors.append(a); return len(accessors) - 1

aP = add_acc(P.astype(np.float32).tobytes(), 5126, len(P), 'VEC3', 34962, (P.min(0).tolist(), P.max(0).tolist()))
aN = add_acc(N.astype(np.float32).tobytes(), 5126, len(N), 'VEC3', 34962)
aU = add_acc(UV.astype(np.float32).tobytes(), 5126, len(UV), 'VEC2', 34962)
aJ = add_acc(joints_v.astype(np.uint8).tobytes(), 5121, len(P), 'VEC4', 34962)
aW = add_acc(weights_v.astype(np.float32).tobytes(), 5126, len(P), 'VEC4', 34962)
aI = add_acc(I.astype(np.uint16).tobytes(), 5123, int(I.size), 'SCALAR', 34963)
ibm = np.zeros((NB, 16), np.float32)
for i in range(NB):
    m = np.eye(4); m[:3, 3] = -jp[i]
    ibm[i] = m.T.reshape(-1)                                  # glTF is column-major
aIBM = add_acc(ibm.tobytes(), 5126, NB, 'MAT4')

imgs = []
for name, data in images:
    imgs.append({'bufferView': add_view(data), 'mimeType': 'image/jpeg', 'name': name})

nodes = []
for i, (name, par, pos) in enumerate(bones):
    local = np.array(pos) - (np.array(bones[par][2]) if par >= 0 else 0)
    nodes.append({'name': name, 'translation': [float(x) for x in local]})
for i, (name, par, pos) in enumerate(bones):
    if par >= 0: nodes[par].setdefault('children', []).append(i)
nodes.append({'name': 'PlayerFemale01', 'mesh': 0, 'skin': 0})
meshNode = len(nodes) - 1

anims = []; samplers_all = []
for cname, (times, rot, hips_t) in clips.items():
    tin = add_acc(times.astype(np.float32).tobytes(), 5126, len(times), 'SCALAR', None, ([float(times.min())], [float(times.max())]))
    samplers = []; channels = []
    for bi in range(NB):
        q = np.array(rot[bi], np.float32)
        if np.allclose(q, q[0], atol=1e-6) and cname != 'idle' and False: continue
        o = add_acc(q.tobytes(), 5126, len(q), 'VEC4')
        samplers.append({'input': tin, 'output': o, 'interpolation': 'LINEAR'})
        channels.append({'sampler': len(samplers) - 1, 'target': {'node': bi, 'path': 'rotation'}})
    jt = add_acc(hips_t.astype(np.float32).tobytes(), 5126, len(hips_t), 'VEC3')
    samplers.append({'input': tin, 'output': jt, 'interpolation': 'LINEAR'})
    channels.append({'sampler': len(samplers) - 1, 'target': {'node': 0, 'path': 'translation'}})
    anims.append({'name': cname, 'samplers': samplers, 'channels': channels})

# hips node translation is root-relative (it has no parent) so keep its world position
j = {'asset': {'version': '2.0', 'generator': 'character rigger'}, 'scene': 0,
     'scenes': [{'nodes': [0, meshNode]}], 'nodes': nodes,
     'skins': [{'joints': list(range(NB)), 'inverseBindMatrices': aIBM, 'skeleton': 0}],
     'meshes': [{'primitives': [{'attributes': {'POSITION': aP, 'NORMAL': aN, 'TEXCOORD_0': aU, 'JOINTS_0': aJ, 'WEIGHTS_0': aW},
                                 'indices': aI, 'material': 0, 'mode': 4}]}],
     'materials': [material], 'textures': J['textures'], 'samplers': J['samplers'], 'images': imgs,
     'accessors': accessors, 'bufferViews': views, 'animations': anims}
while sum(len(c) for c in chunks) % 4: chunks.append(b'\0')
binb = b''.join(chunks); j['buffers'] = [{'byteLength': len(binb)}]
js = json.dumps(j, separators=(',', ':')).encode(); js += b' ' * ((4 - len(js) % 4) % 4)
glb = b'glTF' + struct.pack('<II', 2, 12 + 8 + len(js) + 8 + len(binb)) + struct.pack('<I', len(js)) + b'JSON' + js + struct.pack('<I', len(binb)) + b'BIN\0' + binb
open(OUT, 'wb').write(glb)
print('wrote', OUT, round(len(glb) / 1e6, 3), 'MB', 'bones', NB, 'clips', list(clips))
np.save('/home/claude/rig/owner.npy', owner)
