import json, struct, glob
for f in sorted(glob.glob("characters/*/*.glb")):
    d = open(f, "rb").read()
    n = struct.unpack("<I", d[12:16])[0]
    g = json.loads(d[20:20+n])
    print(f, [m.get("name") for m in g["materials"]], len(g.get("images", [])))
