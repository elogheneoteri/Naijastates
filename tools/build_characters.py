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

def rig_one(src, dst, gender, clips_cache, anim_dir):
    j, b = read_glb(src)
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
    jn, wt = R.skin_weights(prims, J, H, toe)

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
    ibm_cm = ibm.transpose(0, 2, 1)                       # glTF is column-major
    j.setdefault('skins', []).append({'name': 'standard', 'joints': list(range(base, base + R.NB)), 'skeleton': base,
                                      'inverseBindMatrices': ad.acc(ibm_cm.astype(np.float32).tobytes(), 5126, 'MAT4', R.NB)})
    nodes[0]['skin'] = len(j['skins']) - 1
    j['scenes'][0]['nodes'].append(base)
    # --- animations
    if gender not in clips_cache:
        clips_cache[gender] = {k: A.load_clip(os.path.join(anim_dir, v + '.glb')) for k, v in R.SRC[gender].items()}
    clips = clips_cache[gender]
    src_stand_y = float(clips['idle']['pos']['pelvis'][:, 1].mean())
    tgt_hip_y = float(J[0][1]); scale = tgt_hip_y / src_stand_y
    j['animations'] = []
    for name in ('idle', 'walk', 'run'):
        clip = clips[name]
        loc, hip, F = R.retarget(clip, J, toe, src_stand_y, tgt_hip_y, scale)
        t = np.asarray(clip['times'], np.float32)
        t = t[:F] if len(t) >= F else np.arange(F, dtype=np.float32) / FPS
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
            if 'skins' in read_glb(src)[0]:
                print(cid, '- already has a skeleton, skipped'); continue
            gender = 'female' if cid.startswith('female') else 'male'
            print(cid, gender, flush=True)
            for k, v in R.SRC[gender].items():
                p = os.path.join(anim_dir, v + '.glb')
                if not os.path.exists(p):
                    print('   MISSING animation file:', p); sys.exit(1)
            try:
                an = rig_one(src, dst, gender, cache, anim_dir)
            except Exception as e:
                failed.append(cid)
                print(f'   FAILED {cid}: {type(e).__name__}: {e}')
                continue
            print('   ok:', ', '.join(f"{a['name']} (speed {a['extras']['speed']} m/s)" for a in an))
    print()
    print('FAILED CHARACTERS:' if failed else 'ALL DONE, no failures.', ', '.join(failed))

if __name__ == '__main__':
    main()
