"""
build_characters.py - the missing last step of your pipeline.

optimize.py  ->  static, optimized character .glb (feet at y=0, centred)
rigger.py    ->  fits the standard 17-bone skeleton, skins, retargets animation
THIS FILE    ->  runs rigger.py on each character and writes a new .glb that
                 contains the skeleton, the skin weights and three animations
                 named "idle", "walk" and "run" (one male set, one female set).
                 Textures and materials are kept exactly as optimize.py made them.

Put it in the same folder as rigger.py, anim_src.py and glbload.py, then:

    python tools/build_characters.py characters animation characters_rigged

    <optimized_dir>  folder with male_wong.glb, female_emma.glb ... (optimize.py output)
    <animation_dir>  your animation/ folder, containing male/ and female/ sub-folders
                     with the .glb files named in rigger.SRC
    <out_dir>        where the rigged .glb files are written (originals untouched)

Each animation has "extras": {"speed": metres per second} - the ground speed the
clip was made for, scaled to this character. Use it to match walking speed to
the feet so they do not skate.
"""
import json, struct, os, sys, numpy as np
from glbload import GLB
import rigger as R
import anim_src as A

FPS = 30.0

def read_glb(path):
    d = open(path, 'rb').read()
    n = struct.unpack('<I', d[12:16])[0]
    j = json.loads(d[20:20 + n])
    b = bytearray(d[20 + n + 8:])
    return j, b

def write_glb(path, j, b):
    while len(b) % 4: b.append(0)
    j['buffers'] = [{'byteLength': len(b)}]
    js = json.dumps(j, separators=(',', ':')).encode()
    js += b' ' * ((4 - len(js) % 4) % 4)
    out = (b'glTF' + struct.pack('<II', 2, 12 + 8 + len(js) + 8 + len(b)) +
           struct.pack('<I', len(js)) + b'JSON' + js + struct.pack('<I', len(b)) + b'BIN\0' + bytes(b))
    open(path, 'wb').write(out)

class Adder:
    def __init__(self, j, b): self.j, self.b = j, b
    def view(self, data, target=None):
        while len(self.b) % 4: self.b.append(0)
        v = {'buffer': 0, 'byteOffset': len(self.b), 'byteLength': len(data)}
        if target: v['target'] = target
        self.b.extend(data); self.j['bufferViews'].append(v); return len(self.j['bufferViews']) - 1
    def acc(self, data, ct, typ, count, target=None, mm=None):
        a = {'bufferView': self.view(data, target), 'componentType': ct, 'count': count, 'type': typ}
        if mm: a['min'], a['max'] = mm
        self.j['accessors'].append(a); return len(self.j['accessors']) - 1


def strip_rig(j, b):
    """Remove an older skeleton / skin / animations and drop the data nobody uses any more, so the character can be rigged again."""
    for m in j['meshes']:
        for p in m['primitives']:
            p['attributes'].pop('JOINTS_0', None); p['attributes'].pop('WEIGHTS_0', None)
    keep = len(j['nodes'])
    skel = set()
    for sk in j.get('skins', []):
        skel.update(sk['joints'])
    for n in j['nodes']: n.pop('skin', None)
    j.pop('skins', None); j.pop('animations', None)
    # delete skeleton nodes (they are the last nodes) and renumber
    gone = sorted(skel); remap = {}; k = 0
    for i in range(len(j['nodes'])):
        if i in skel: continue
        remap[i] = k; k += 1
    nodes = [n for i, n in enumerate(j['nodes']) if i not in skel]
    for n in nodes:
        if 'children' in n: n['children'] = [remap[c] for c in n['children'] if c in remap]; n['children'] or n.pop('children')
    j['nodes'] = nodes
    for sc in j['scenes']: sc['nodes'] = [remap[i] for i in sc['nodes'] if i in remap]
    # compact the binary: keep only accessors the meshes use, and the buffer views those and the images use
    used_acc = []
    for m in j['meshes']:
        for p in m['primitives']:
            for a in list(p['attributes'].values()) + ([p['indices']] if 'indices' in p else []):
                if a not in used_acc: used_acc.append(a)
    amap = {a: i for i, a in enumerate(used_acc)}
    for m in j['meshes']:
        for p in m['primitives']:
            p['attributes'] = {k2: amap[v] for k2, v in p['attributes'].items()}
            if 'indices' in p: p['indices'] = amap[p['indices']]
    accs = [j['accessors'][a] for a in used_acc]
    need_bv = []
    for a in accs:
        if a.get('bufferView') is not None and a['bufferView'] not in need_bv: need_bv.append(a['bufferView'])
    for im in j.get('images', []):
        if 'bufferView' in im and im['bufferView'] not in need_bv: need_bv.append(im['bufferView'])
    bmap = {v: i for i, v in enumerate(need_bv)}
    nb = bytearray(); views = []
    for v in need_bv:
        bv = j['bufferViews'][v]; data = b[bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']]
        while len(nb) % 4: nb.append(0)
        nv = dict(bv); nv['byteOffset'] = len(nb); nb.extend(data); views.append(nv)
    for a in accs:
        if a.get('bufferView') is not None: a['bufferView'] = bmap[a['bufferView']]
    for im in j.get('images', []):
        if 'bufferView' in im: im['bufferView'] = bmap[im['bufferView']]
    j['accessors'] = accs; j['bufferViews'] = views
    return j, nb


def put_accessor(j, buf, acc_index, arr):
    """overwrite a float accessor's data in place (used to bend the arms of the mesh down into a relaxed A-pose)"""
    a = j['accessors'][acc_index]; bv = j['bufferViews'][a['bufferView']]
    assert a['componentType'] == 5126 and not bv.get('byteStride')
    off = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    data = np.ascontiguousarray(arr, np.float32).tobytes(); buf[off:off + len(data)] = data
    if a['type'] == 'VEC3' and 'min' in a:
        a['min'] = [float(x) for x in arr.min(0)]; a['max'] = [float(x) for x in arr.max(0)]

def bake_apose(j, buf, prims, jn, wt, J, deg):
    """The characters are modelled with arms straight out (T-pose). Bending a sleeve 80 degrees in one go folds it up at the shoulder,
    so the mesh itself is lowered by `deg` degrees here (skinned with the same weights) and the skeleton gets the same bend.
    The animations are unchanged: they still describe the turn away from the T-pose."""
    theta = np.radians(deg)
    P = np.concatenate([p['pos'] for p in prims]); newP = P.copy()
    N = None
    prim_list = j['meshes'][0]['primitives']
    if all('NORMAL' in pr['attributes'] for pr in prim_list):
        N = np.concatenate([GLB_acc(j, buf, pr['attributes']['NORMAL']) for pr in prim_list]).astype(np.float64); newN = N.copy()
    Rs = {}; J2 = J.copy()
    for s, sg in (('L', -1), ('R', 1)):
        d = J[R.IX['LowerArm_' + s]] - J[R.IX['UpperArm_' + s]]; d = d / np.linalg.norm(d)
        down = float(np.degrees(np.arcsin(np.clip(-d[1], -1, 1))))      # how far this arm already hangs below horizontal
        if down >= deg - 5: Rs[s] = np.eye(3); continue
        a = sg * np.radians(deg - down); c, sn = np.cos(a), np.sin(a)
        Rm = np.array([[c, -sn, 0], [sn, c, 0], [0, 0, 1]]); Rs[s] = Rm
        bones = [R.IX['UpperArm_' + s], R.IX['LowerArm_' + s], R.IX['Hand_' + s]]
        S = J[bones[0]]
        w = sum(wt[:, k] * np.isin(jn[:, k], bones) for k in range(4))
        newP += w[:, None] * ((P - S) @ Rm.T + S - P)
        if N is not None: newN += w[:, None] * (N @ Rm.T - N)
        for bi in bones[1:]: J2[bi] = Rm @ (J[bi] - S) + S
    off = 0
    for pr, p in zip(prim_list, prims):
        n = len(p['pos'])
        put_accessor(j, buf, pr['attributes']['POSITION'], newP[off:off + n])
        if N is not None:
            nn = newN[off:off + n]; nn /= np.maximum(np.linalg.norm(nn, axis=1, keepdims=True), 1e-9)
            put_accessor(j, buf, pr['attributes']['NORMAL'], nn)
        off += n
    return J2, Rs

def GLB_acc(j, buf, i):
    a = j['accessors'][i]; bv = j['bufferViews'][a['bufferView']]
    off = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    return np.frombuffer(bytes(buf[off:off + a['count'] * 12]), np.float32).reshape(-1, 3)


def cut_foot_bridges(j, buf):
    """Triangles that join the left shoe to the right shoe (left over from shrinking the model) get stretched into a big dark
    sheet as soon as the legs move apart. They are not visible at rest, so they are simply removed."""
    CT = {5121: np.uint8, 5123: np.uint16, 5125: np.uint32}
    removed = 0
    allv = []
    for pr in j['meshes'][0]['primitives']:
        a = j['accessors'][pr['attributes']['POSITION']]; bv = j['bufferViews'][a['bufferView']]
        off = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
        allv.append(np.frombuffer(bytes(buf[off:off + a['count'] * 12]), np.float32).reshape(-1, 3))
    H = float(max(v[:, 1].max() for v in allv))
    for pr, P in zip(j['meshes'][0]['primitives'], allv):
        ia = j['accessors'][pr['indices']]; bv = j['bufferViews'][ia['bufferView']]
        off = bv.get('byteOffset', 0) + ia.get('byteOffset', 0); dt = CT[ia['componentType']]
        I = np.frombuffer(bytes(buf[off:off + ia['count'] * np.dtype(dt).itemsize]), dt).reshape(-1, 3).astype(np.int64)
        X = P[I][:, :, 0]; Y = P[I][:, :, 1]
        low = (Y < 0.12 * H).all(1)
        straddle = (X.min(1) < -0.02) & (X.max(1) > 0.02)
        bad = low & straddle
        if not bad.any(): continue
        keep = I[~bad].astype(dt)
        data = keep.tobytes(); buf[off:off + len(data)] = data
        ia['count'] = int(keep.size); bv['byteLength'] = min(bv['byteLength'], len(data) + a_off(ia)) if False else bv['byteLength']
        removed += int(bad.sum())
    return removed

def a_off(a): return a.get('byteOffset', 0)

def fit_relaxed(P):
    """backup for characters whose arms hang at the sides: same fit, wider arm search"""
    import inspect
    src = inspect.getsource(R.fit_skeleton)
    src = src.replace('side * P[:, 0] > 0.14 * H', 'side * P[:, 0] > 0.06 * H').replace('P[:, 1] > 0.35 * H', 'P[:, 1] > 0.25 * H')
    ns = dict(vars(R)); exec(src, ns)
    return ns['fit_skeleton'](P)

def sanity(J, H, info, name):
    warn = []
    if J[R.IX['LowerLeg_L']][0] <= 0 or J[R.IX['LowerLeg_R']][0] >= 0:
        warn.append('legs not found on the correct sides (dress/skirt?) - check this character')
    if abs(J[R.IX['LowerLeg_L']][0] - J[R.IX['LowerLeg_R']][0]) < 0.08 * H:
        warn.append('legs look too close together - skeleton legs may be wrong')
    for s in 'LR':
        L = info['arm_len_' + s]
        if not (0.36 < L < 0.58): warn.append(f'arm {s} length {L:.2f} x height is unusual - arms may not be in a T-pose')
    for w in warn: print(f'   WARNING {name}: {w}')

def rig_one(src, dst, gender, clips_cache, anim_dir, static=False):
    j, b = read_glb(src)
    if 'skins' in j:                      # already rigged by an older version: take the old rig off first
        j, b = strip_rig(j, b)
    nb_ = cut_foot_bridges(j, b)
    if nb_: print(f'   removed {nb_} triangles joining the two feet')
    tmp = dst + '.tmp'; write_glb(tmp, j, b); src = tmp
    g = GLB(src)
    prims = [dict(pos=g.acc(p['attributes']['POSITION']).astype(np.float64),
                  idx=g.acc(p['indices']).reshape(-1, 3).astype(np.int64))
             for p in j['meshes'][0]['primitives']]
    P = np.concatenate([p['pos'] for p in prims])
    try:
        J, H, info, toe = R.fit_skeleton(P)
    except Exception as e:
        print(f'   normal fit failed ({type(e).__name__}: {e}) - trying the arms-down backup')
        J, H, info, toe = fit_relaxed(P)
    sanity(J, H, info, os.path.basename(src))
    if static:      # NPCs: not in a T-pose, so they get the skeleton but stay in their own pose (everything follows the hips)
        n_all = len(P); jn = np.zeros((n_all, 4), np.uint8); wt = np.zeros((n_all, 4), np.float32); wt[:, 0] = 1
    else:
        jn, wt = R.skin_weights(prims, J, H, toe)

    J2, Rs = (bake_apose(j, b, prims, jn, wt, J, R.APOSE_DEG) if (R.APOSE_DEG > 0 and not static) else (J, None))
    ad = Adder(j, b)
    # --- skin weights per primitive
    off = 0
    for p, prim in zip(prims, j['meshes'][0]['primitives']):
        n = len(p['pos'])
        prim['attributes']['JOINTS_0'] = ad.acc(np.ascontiguousarray(jn[off:off + n]).astype(np.uint8).tobytes(), 5121, 'VEC4', n, 34962)
        prim['attributes']['WEIGHTS_0'] = ad.acc(np.ascontiguousarray(wt[off:off + n]).astype(np.float32).tobytes(), 5126, 'VEC4', n, 34962)
        off += n
    # --- skeleton nodes
    nodes = j['nodes']; base = len(nodes)
    for i, name in enumerate(R.NAMES):
        t = J[i] if R.PARENT[i] < 0 else J[i] - J[R.PARENT[i]]
        nodes.append({'name': name, 'translation': [float(x) for x in t]})
    for i in range(R.NB):
        if R.PARENT[i] >= 0:
            nodes[base + R.PARENT[i]].setdefault('children', []).append(base + i)
    ibm = np.zeros((R.NB, 4, 4), np.float32)
    for i in range(R.NB):
        ibm[i] = np.eye(4); ibm[i][:3, 3] = -J[i]
    if Rs:
        for s in 'LR':
            Rm = Rs[s]; ang = np.arctan2(Rm[1, 0], Rm[0, 0])
            nodes[base + R.IX['UpperArm_' + s]]['rotation'] = [0.0, 0.0, float(np.sin(ang / 2)), float(np.cos(ang / 2))]
            for bn in ('UpperArm_', 'LowerArm_', 'Hand_'):
                i = R.IX[bn + s]; ibm[i] = np.eye(4); ibm[i][:3, :3] = Rm.T; ibm[i][:3, 3] = -Rm.T @ J2[i]
    ibm_cm = ibm.transpose(0, 2, 1)                       # glTF is column-major
    j.setdefault('skins', []).append({'name': 'standard', 'joints': list(range(base, base + R.NB)), 'skeleton': base,
                                      'inverseBindMatrices': ad.acc(ibm_cm.astype(np.float32).tobytes(), 5126, 'MAT4', R.NB)})
    nodes[0]['skin'] = len(j['skins']) - 1
    j['scenes'][0]['nodes'].append(base)
    # --- animations
    if gender not in clips_cache:
        clips_cache[gender] = {}
        for k, v in R.SRC[gender].items():
            if v.startswith('hold:'): clips_cache[gender][k] = R.make_hold_idle(A.load_clip(os.path.join(anim_dir, v[5:] + '.glb')))
            else: clips_cache[gender][k] = A.load_clip(os.path.join(anim_dir, v + '.glb'))
    clips = clips_cache[gender]
    src_stand_y = float(clips['idle']['pos']['pelvis'][:, 1].mean())
    tgt_hip_y = float(J[0][1]); scale = tgt_hip_y / src_stand_y
    j['animations'] = []
    for name in ('idle', 'walk', 'run'):
        clip = clips[name]
        loc, hip, F = R.retarget(clip, J, toe, src_stand_y, tgt_hip_y, scale)
        if static:
            F = 2; loc = np.zeros((R.NB, 2, 4)); loc[..., 3] = 1; hip = np.tile(J[0], (2, 1))
        t = np.asarray(clip['times'], np.float32)
        t = t[:F] if len(t) >= F else np.arange(F, dtype=np.float32) / FPS
        if static: t = np.array([0, 1.0], np.float32)
        t = t - t[0]
        tin = ad.acc(t.astype(np.float32).tobytes(), 5126, 'SCALAR', F, None, ([float(t.min())], [float(t.max())]))
        samplers, channels = [], []
        for bi in range(R.NB):
            q = R.qnorm(loc[bi]).astype(np.float32)
            samplers.append({'input': tin, 'output': ad.acc(q.tobytes(), 5126, 'VEC4', F), 'interpolation': 'LINEAR'})
            channels.append({'sampler': len(samplers) - 1, 'target': {'node': base + bi, 'path': 'rotation'}})
        samplers.append({'input': tin, 'output': ad.acc(hip.astype(np.float32).tobytes(), 5126, 'VEC3', F), 'interpolation': 'LINEAR'})
        channels.append({'sampler': len(samplers) - 1, 'target': {'node': base, 'path': 'translation'}})
        j['animations'].append({'name': name, 'samplers': samplers, 'channels': channels,
                                'extras': {'speed': round(R.foot_speed(clip) * scale, 3)}})
    j['asset']['generator'] = 'character optimizer + rigger'
    write_glb(dst, j, b)
    if dst.endswith('.glb') and os.path.exists(dst + '.tmp'): os.remove(dst + '.tmp')
    return j['animations']

def main():
    if len(sys.argv) < 4:
        print(__doc__); sys.exit(1)
    src_dir, anim_dir, out_dir = sys.argv[1:4]; only = sys.argv[4:]
    cache = {}; failed = []
    for root, _, files in os.walk(src_dir):
        for f in sorted(files):
            if not f.endswith('.glb'): continue
            cid = f[:-4]
            if only and cid not in only: continue
            src = os.path.join(root, f)
            dst = os.path.join(out_dir, os.path.relpath(src, src_dir))
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            gender = 'female' if cid.startswith('female') else 'male'
            print(cid, gender, flush=True)
            for k, v in R.SRC[gender].items():
                p = os.path.join(anim_dir, v.replace('hold:', '') + '.glb')
                if not os.path.exists(p):
                    print('   MISSING animation file:', p); sys.exit(1)
            try:
                an = rig_one(src, dst, gender, cache, anim_dir, static=(os.path.basename(root) == 'npc'))
            except Exception as e:
                failed.append(cid)
                print(f'   FAILED {cid}: {type(e).__name__}: {e}')
                continue
            print('   ok:', ', '.join(f"{a['name']} (speed {a['extras']['speed']} m/s)" for a in an))
    print()
    print('FAILED CHARACTERS:' if failed else 'ALL DONE, no failures.', ', '.join(failed))

if __name__ == '__main__':
    main()
