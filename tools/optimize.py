import os, sys, json, io, struct, subprocess, shutil, numpy as np
from collections import OrderedDict
from PIL import Image
from glbload import GLB
import rend

U = '/root/.claude/uploads/ed747de7-0622-54cb-acb8-64289cb7ee34/'
OUT = '/home/claude/chars/out'; os.makedirs(OUT, exist_ok=True)
TOTAL_TRIS = 14000

def run_decimate(P, UV, I, target, work):
    shutil.rmtree(work, ignore_errors=True); os.makedirs(work)
    P.astype(np.float32).tofile(work + '/P.bin'); UV.astype(np.float32).tofile(work + '/UV.bin'); I.astype(np.uint32).tofile(work + '/I.bin')
    open(work + '/counts.txt', 'w').write(f'{len(P)} {len(I)}')
    r = subprocess.run(['./decimate', str(target), '0.0', work + '/', '0'], capture_output=True, text=True)
    oP = np.fromfile(work + '/oP.bin', np.float32).reshape(-1, 3); oN = np.fromfile(work + '/oN.bin', np.float32).reshape(-1, 3)
    oUV = np.fromfile(work + '/oUV.bin', np.float32).reshape(-1, 2); oI = np.fromfile(work + '/oI.bin', np.uint32).reshape(-1, 3)
    return oP, oN, oUV, oI, r.stderr.strip().splitlines()[-1] if r.stderr else ''

def encode_tex(arr, alpha_mode, maxdim):
    im = Image.fromarray(arr)
    if max(im.size) > maxdim:
        s = maxdim / max(im.size); im = im.resize((max(8, int(im.size[0] * s)), max(8, int(im.size[1] * s))), Image.LANCZOS)
    bio = io.BytesIO()
    if alpha_mode != 'OPAQUE' and (arr[..., 3] < 250).any():
        im.save(bio, 'PNG', optimize=True); return bio.getvalue(), 'image/png'
    im.convert('RGB').save(bio, 'JPEG', quality=84, optimize=True, progressive=True); return bio.getvalue(), 'image/jpeg'

def process(src, outname, height, work_name):
    g = GLB(src, tex_max=1024); prims = g.primitives()
    allp = np.concatenate([p['pos'] for p in prims]); lo, hi = allp.min(0), allp.max(0)
    scale = height / (hi[1] - lo[1]); cx = (lo[0] + hi[0]) / 2; cz = (lo[2] + hi[2]) / 2
    orig_tris = sum(len(p['idx']) for p in prims)
    # merge primitives that use the same texture/material
    groups = OrderedDict()
    for p in prims:
        k = (p['img'], p['alpha'], tuple(np.round(p['color'], 3)), p['dside'])
        groups.setdefault(k, []).append(p)
    merged = []
    for k, ps in groups.items():
        pos = np.concatenate([(p['pos'] - [cx, lo[1], cz]) * scale for p in ps]); uv = np.concatenate([p['uv'] for p in ps])
        off = np.cumsum([0] + [len(p['pos']) for p in ps])[:-1]
        idx = np.concatenate([p['idx'] + o for p, o in zip(ps, off)])
        merged.append(dict(key=k, pos=pos, uv=uv, idx=idx, tex=ps[0]['tex'], alpha=ps[0]['alpha'], color=ps[0]['color'], dside=any(p['dside'] for p in ps), name=ps[0]['name']))
    # triangle budget
    small = [m for m in merged if len(m['idx']) <= 1200]; big = [m for m in merged if len(m['idx']) > 1200]
    left = max(TOTAL_TRIS - sum(len(m['idx']) for m in small), 6000)
    tot_big = sum(len(m['idx']) for m in big) or 1
    for m in big: m['target'] = int(max(1500, left * len(m['idx']) / tot_big))
    out_prims = []; log = []
    for gi, m in enumerate(merged):
        n0 = len(m['idx'])
        if 'target' in m and m['target'] < n0:
            oP, oN, oUV, oI, msg = run_decimate(m['pos'], m['uv'], m['idx'], m['target'], f'/tmp/dec_{work_name}_{gi}')
        else:
            # keep as is, only compute smooth normals
            oP, oN, oUV, oI, msg = run_decimate(m['pos'], m['uv'], m['idx'], n0 + 1, f'/tmp/dec_{work_name}_{gi}')
        m.update(oP=oP, oN=oN, oUV=oUV, oI=oI); log.append((n0, len(oI)))
    # write glb
    chunks = []; views = []; accessors = []; images = []; textures = []; materials = []; meshprims = []
    def add_view(data, target=None):
        while sum(len(c) for c in chunks) % 4: chunks.append(b'\0')
        off = sum(len(c) for c in chunks); chunks.append(bytes(data))
        v = {'buffer': 0, 'byteOffset': off, 'byteLength': len(data)}
        if target: v['target'] = target
        views.append(v); return len(views) - 1
    def add_acc(data, ct, count, typ, target=None, mm=None):
        a = {'bufferView': add_view(data, target), 'componentType': ct, 'count': count, 'type': typ}
        if mm: a['min'], a['max'] = mm
        accessors.append(a); return len(accessors) - 1
    for m in merged:
        n = len(m['oI']); vcount = len(m['oP'])
        maxdim = 1024 if n > 1500 else (512 if n > 300 else 256)
        mat = {'name': m['name'] or 'mat', 'doubleSided': bool(m['dside'] or m['alpha'] != 'OPAQUE'),
               'pbrMetallicRoughness': {'metallicFactor': 0.0, 'roughnessFactor': 0.85}}
        col = [float(c) for c in m['color']]
        if m['tex'] is not None:
            data, mime = encode_tex(m['tex'], m['alpha'], maxdim)
            images.append({'bufferView': add_view(data), 'mimeType': mime}); textures.append({'sampler': 0, 'source': len(images) - 1})
            mat['pbrMetallicRoughness']['baseColorTexture'] = {'index': len(textures) - 1}
            mat['pbrMetallicRoughness']['baseColorFactor'] = [1, 1, 1, col[3] if m['alpha'] == 'OPAQUE' else 1]
        else:
            mat['pbrMetallicRoughness']['baseColorFactor'] = col
        if m['alpha'] != 'OPAQUE':
            mat['alphaMode'] = 'MASK'; mat['alphaCutoff'] = 0.4
        materials.append(mat)
        P = m['oP']
        aP = add_acc(P.tobytes(), 5126, vcount, 'VEC3', 34962, (P.min(0).tolist(), P.max(0).tolist()))
        aN = add_acc(m['oN'].astype(np.float32).tobytes(), 5126, vcount, 'VEC3', 34962)
        aU = add_acc(m['oUV'].astype(np.float32).tobytes(), 5126, vcount, 'VEC2', 34962)
        if vcount < 65535: aI = add_acc(m['oI'].astype(np.uint16).tobytes(), 5123, int(m['oI'].size), 'SCALAR', 34963)
        else: aI = add_acc(m['oI'].astype(np.uint32).tobytes(), 5125, int(m['oI'].size), 'SCALAR', 34963)
        meshprims.append({'attributes': {'POSITION': aP, 'NORMAL': aN, 'TEXCOORD_0': aU}, 'indices': aI, 'material': len(materials) - 1, 'mode': 4})
    while sum(len(c) for c in chunks) % 4: chunks.append(b'\0')
    binb = b''.join(chunks)
    j = {'asset': {'version': '2.0', 'generator': 'character optimizer'}, 'scene': 0, 'scenes': [{'nodes': [0]}],
         'nodes': [{'name': outname, 'mesh': 0}], 'meshes': [{'primitives': meshprims}], 'materials': materials, 'accessors': accessors,
         'bufferViews': views, 'buffers': [{'byteLength': len(binb)}],
         'samplers': [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 10497, 'wrapT': 10497}]}
    if images: j['images'] = images; j['textures'] = textures
    js = json.dumps(j, separators=(',', ':')).encode(); js += b' ' * ((4 - len(js) % 4) % 4)
    glb = b'glTF' + struct.pack('<II', 2, 12 + 8 + len(js) + 8 + len(binb)) + struct.pack('<I', len(js)) + b'JSON' + js + struct.pack('<I', len(binb)) + b'BIN\0' + binb
    open(f'{OUT}/{outname}.glb', 'wb').write(glb)
    new_tris = sum(len(m['oI']) for m in merged)
    return dict(orig_mb=round(g.size_bytes / 1e6, 1), new_mb=round(len(glb) / 1e6, 2), orig_tris=orig_tris, new_tris=new_tris, prims=len(merged),
                src_prims=len(prims))

JOBS = [  # id, source file stem, height (m)
    ('male_wong',       'wong-_3d_character_model_rigged', 1.78),
    ('male_civilian',   'male_civilian_v1', 1.80),
    ('male_streetwear', 'nep_don_model_garena_freefire', 1.75),
    ('female_sammie',   'sammie', 1.66),
    ('female_emma',     'emma_female_character', 1.68),
    ('female_summer',   'summer_vibes', 1.66),
    ('female_jeans',    'hight_quality_realistic_girl_character', 1.65),
    ('female_floral',   'first-_p', 1.68),
    ('female_rocker',   'rocker_girl', 1.66),
    ('female_elizabeth','elizabeth_female_3_d_character', 1.68),
    ('female_sophia',   'sophia_metzger_business-casual_attire', 1.70),
    ('female_ivory',    'ivory_steele__corporate_precision', 1.70),
]
if __name__ == '__main__':
    only = sys.argv[1:]
    res = {}
    for oid, stem, h in JOBS:
        if only and oid not in only: continue
        path = [os.path.join(U, f) for f in os.listdir(U) if f.endswith(stem + '.glb')][0]
        r = process(path, oid, h, oid); res[oid] = r; print(oid, r, flush=True)
    json.dump(res, open(f'{OUT}/report.json' if not only else f'{OUT}/report_part.json', 'w'), indent=1)
