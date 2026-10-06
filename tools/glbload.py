"""General glTF/GLB reader for previews: applies node transforms and skinning (at the file's rest pose)."""
import struct, json, io, numpy as np
from PIL import Image

CT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}

class GLB:
    def __init__(self, path, tex_max=512):
        d = open(path, 'rb').read()
        l = struct.unpack('<I', d[12:16])[0]
        self.j = json.loads(d[20:20+l]); self.bin = d[20+l+8:]
        self.tex_max = tex_max; self._img = {}
        self.size_bytes = len(d)

    def acc(self, i):
        a = self.j['accessors'][i]; dt = CT[a['componentType']]; n = NC[a['type']]
        cnt = a['count']
        if 'bufferView' in a:
            bv = self.j['bufferViews'][a['bufferView']]
            off = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
            stride = bv.get('byteStride', 0); isz = np.dtype(dt).itemsize * n
            if stride and stride != isz:
                raw = np.frombuffer(self.bin, np.uint8, count=stride * cnt, offset=off).reshape(cnt, stride)[:, :isz]
                arr = np.frombuffer(np.ascontiguousarray(raw).tobytes(), dt).reshape(cnt, n)
            else:
                arr = np.frombuffer(self.bin, dt, cnt * n, off).reshape(cnt, n)
        else:
            arr = np.zeros((cnt, n), dt)
        if a.get('normalized'):
            arr = arr.astype(np.float32) / float(np.iinfo(dt).max) if dt != np.float32 else arr
            if dt in (np.int8, np.int16): arr = np.maximum(arr, -1)
        return arr

    def image(self, idx):
        if idx in self._img: return self._img[idx]
        im = self.j['images'][idx]
        if 'bufferView' in im:
            bv = self.j['bufferViews'][im['bufferView']]
            data = self.bin[bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']]
        else:
            data = None
        if data is None: self._img[idx] = None; return None
        try:
            pi = Image.open(io.BytesIO(data)); pi.load()
            if max(pi.size) > self.tex_max:
                s = self.tex_max / max(pi.size); pi = pi.resize((max(1, int(pi.size[0]*s)), max(1, int(pi.size[1]*s))), Image.BILINEAR)
            arr = np.array(pi.convert('RGBA'))
        except Exception:
            arr = None
        self._img[idx] = arr; return arr

    def tex_of(self, ti):
        t = self.j['textures'][ti]
        src = t.get('source')
        if src is None:
            for k, v in t.get('extensions', {}).items():
                if 'source' in v: src = v['source']
        return None if src is None else self.image(src)

    def node_world(self):
        nodes = self.j['nodes']; W = [None] * len(nodes)
        par = {}
        for i, n in enumerate(nodes):
            for c in n.get('children', []): par[c] = i
        def local(n):
            if 'matrix' in n: return np.array(n['matrix'], float).reshape(4, 4).T
            M = np.eye(4); t = n.get('translation', [0, 0, 0]); r = n.get('rotation', [0, 0, 0, 1]); s = n.get('scale', [1, 1, 1])
            x, y, z, w = r
            R = np.array([[1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w)], [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w)], [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y)]])
            M[:3, :3] = R * np.array(s); M[:3, 3] = t; return M
        def get(i):
            if W[i] is None:
                W[i] = (get(par[i]) if i in par else np.eye(4)) @ local(nodes[i])
            return W[i]
        for i in range(len(nodes)): get(i)
        return W

    def primitives(self):
        """yield dicts: pos (world), uv, idx, color factor, texture (RGBA array or None), alpha mode"""
        j = self.j; W = self.node_world(); out = []
        for ni, n in enumerate(j['nodes']):
            if 'mesh' not in n: continue
            skin = j['skins'][n['skin']] if 'skin' in n else None
            if skin:
                ibm = self.acc(skin['inverseBindMatrices']).reshape(-1, 4, 4).transpose(0, 2, 1) if 'inverseBindMatrices' in skin else np.tile(np.eye(4), (len(skin['joints']), 1, 1))
                SM = np.stack([W[jn] @ ibm[k] for k, jn in enumerate(skin['joints'])])
            for p in j['meshes'][n['mesh']]['primitives']:
                if p.get('mode', 4) != 4: continue
                at = p['attributes']
                P = self.acc(at['POSITION']).astype(np.float64)
                Ph = np.concatenate([P, np.ones((len(P), 1))], 1)
                if skin and 'JOINTS_0' in at:
                    J_ = self.acc(at['JOINTS_0']).astype(int); Wt = self.acc(at['WEIGHTS_0']).astype(np.float64)
                    Pw = np.zeros((len(P), 3))
                    for k in range(J_.shape[1]):
                        Pw += Wt[:, k:k+1] * np.einsum('nij,nj->ni', SM[J_[:, k]], Ph)[:, :3]
                else:
                    Pw = (W[ni] @ Ph.T).T[:, :3]
                UV = self.acc(at['TEXCOORD_0']).astype(np.float32) if 'TEXCOORD_0' in at else np.zeros((len(P), 2), np.float32)
                if UV.dtype != np.float32 or UV.max() > 1e4: UV = UV.astype(np.float32)
                I = self.acc(p['indices']).reshape(-1, 3).astype(np.int64) if 'indices' in p else np.arange(len(P)).reshape(-1, 3)
                m = j['materials'][p['material']] if 'material' in p else {}
                pbr = m.get('pbrMetallicRoughness', {}); sg = m.get('extensions', {}).get('KHR_materials_pbrSpecularGlossiness', {})
                color = pbr.get('baseColorFactor', sg.get('diffuseFactor', [1, 1, 1, 1]))
                bt = pbr.get('baseColorTexture') or sg.get('diffuseTexture')
                tex = self.tex_of(bt['index']) if bt else None
                out.append(dict(pos=Pw, uv=UV, idx=I, color=np.array(color), tex=tex, alpha=m.get('alphaMode', 'OPAQUE'),
                                cutoff=m.get('alphaCutoff', 0.5), name=m.get('name', ''), node=ni))
        return out
