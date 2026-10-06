"""Read one of the free animation .glb files (a 3ds Max biped) and give back world-space joint positions per frame."""
import numpy as np
from glbload import GLB

def quat_to_mat(q):
    x, y, z, w = q
    return np.array([[1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w)], [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w)], [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y)]])

def mat_to_quat(R):
    t = np.trace(R)
    if t > 0:
        s = np.sqrt(t + 1) * 2; return np.array([(R[2, 1]-R[1, 2])/s, (R[0, 2]-R[2, 0])/s, (R[1, 0]-R[0, 1])/s, 0.25*s])
    i = np.argmax([R[0, 0], R[1, 1], R[2, 2]])
    if i == 0:
        s = np.sqrt(1 + R[0, 0]-R[1, 1]-R[2, 2]) * 2; return np.array([0.25*s, (R[0, 1]+R[1, 0])/s, (R[0, 2]+R[2, 0])/s, (R[2, 1]-R[1, 2])/s])
    if i == 1:
        s = np.sqrt(1 + R[1, 1]-R[0, 0]-R[2, 2]) * 2; return np.array([(R[0, 1]+R[1, 0])/s, 0.25*s, (R[1, 2]+R[2, 1])/s, (R[0, 2]-R[2, 0])/s])
    s = np.sqrt(1 + R[2, 2]-R[0, 0]-R[1, 1]) * 2; return np.array([(R[0, 2]+R[2, 0])/s, (R[1, 2]+R[2, 1])/s, 0.25*s, (R[1, 0]-R[0, 1])/s])

NEED = {  # prefix of the biped joint name -> short key
    'bip Pelvis': 'pelvis', 'bip Spine': 'spine', 'bip Spine1': 'spine1', 'bip Neck': 'neck', 'bip Head': 'head',
    'bip L UpperArm': 'L_upper', 'bip L Forearm': 'L_fore', 'bip L Hand': 'L_hand',
    'bip R UpperArm': 'R_upper', 'bip R Forearm': 'R_fore', 'bip R Hand': 'R_hand',
    'bip L Thigh': 'L_thigh', 'bip L Calf': 'L_calf', 'bip L Foot': 'L_foot', 'bip L Toe0': 'L_toe',
    'bip R Thigh': 'R_thigh', 'bip R Calf': 'R_calf', 'bip R Foot': 'R_foot', 'bip R Toe0': 'R_toe',
}

def load_clip(path):
    g = GLB(path); j = g.j; nodes = j['nodes']; an = j['animations'][0]
    # per-node animated tracks
    tr = {}
    times = None
    for ch in an['channels']:
        s = an['samplers'][ch['sampler']]
        t = g.acc(s['input']).reshape(-1); v = g.acc(s['output'])
        if times is None or len(t) > len(times): times = t
        tr[(ch['target']['node'], ch['target']['path'])] = (t, v.astype(float))
    F = len(times)
    par = {}
    for i, n in enumerate(nodes):
        for c in n.get('children', []): par[c] = i
    def local(i, f):
        n = nodes[i]
        def get(path, default):
            if (i, path) in tr:
                t, v = tr[(i, path)]
                k = min(f, len(v) - 1); return v[k]
            return default
        if 'matrix' in n and not any((i, p) in tr for p in ('translation', 'rotation', 'scale')):
            return np.array(n['matrix'], float).reshape(4, 4).T
        T = get('translation', np.array(n.get('translation', [0, 0, 0]), float))
        R = get('rotation', np.array(n.get('rotation', [0, 0, 0, 1]), float))
        S = get('scale', np.array(n.get('scale', [1, 1, 1]), float))
        M = np.eye(4); M[:3, :3] = quat_to_mat(R / np.linalg.norm(R)) * S; M[:3, 3] = T
        return M
    keyidx = {}
    for i, n in enumerate(nodes):
        nm = n.get('name', '').split('_')[0]
        if nm in NEED: keyidx[NEED[nm]] = i
    order = []
    def visit(i):
        order.append(i)
        for c in nodes[i].get('children', []): visit(c)
    for r in j['scenes'][0]['nodes']: visit(r)
    pos = {k: np.zeros((F, 3)) for k in keyidx}; rot = {k: np.zeros((F, 4)) for k in keyidx}
    for f in range(F):
        W = {}
        for i in order:
            W[i] = (W[par[i]] if i in par else np.eye(4)) @ local(i, f)
        for k, i in keyidx.items():
            M = W[i]; pos[k][f] = M[:3, 3]
            R = M[:3, :3] / np.linalg.norm(M[:3, :3], axis=0); rot[k][f] = mat_to_quat(R)
    return dict(times=times, pos=pos, rot=rot, F=F)
