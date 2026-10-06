import json, struct, glob, os
for f in sorted(glob.glob("characters/*/*.glb")):
    size = os.path.getsize(f)
    d = open(f, "rb").read()
    if d[:4] != b"glTF":
        print("BAD FILE:", f, size, "bytes")
        continue
    n = struct.unpack("<I", d[12:16])[0]
    g = json.loads(d[20:20+n])
    print(f, size, "bytes", [m.get("name") for m in g["materials"]], len(g.get("images", [])))
