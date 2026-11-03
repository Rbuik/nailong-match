# -*- coding: utf-8 -*-
"""从 MP4 中提取 AAC 音轨并封装为纯音频 M4A（无需 ffmpeg）
用法: python .tmp-mp4-to-m4a.py <src.mp4> <out.m4a>
"""
import struct, sys, os

SRC = sys.argv[1]
OUT = sys.argv[2]
buf = open(SRC, "rb").read()


def boxes(b, off, end):
    out = []
    while off + 8 <= end:
        sz, typ = struct.unpack(">I4s", b[off:off + 8])
        if sz == 1:
            sz = struct.unpack(">Q", b[off + 8:off + 16])[0]
        if sz < 8:
            break
        out.append((typ.decode("latin1"), off, sz))
        off += sz
    return out


def get_box(b, off, end, name):
    for t, o, s in boxes(b, off, end):
        if t == name:
            return b[o:o + s]
    return None


top = boxes(buf, 0, len(buf))
moov = [x for x in top if x[0] == "moov"][0]
audio_trak = None
for t, o, s in boxes(buf, moov[1] + 8, moov[1] + moov[2]):
    if t == "trak" and b"soun" in buf[o:o + s]:
        audio_trak = (o, s)
        break
assert audio_trak, "no audio track"
to, ts = audio_trak
trak = buf[to:to + ts]

mdia = get_box(trak, 8, len(trak), "mdia")
mdhd = get_box(mdia, 8, len(mdia), "mdhd")
minf = get_box(mdia, 8, len(mdia), "minf")
stbl = get_box(minf, 8, len(minf), "stbl")

if mdhd[8] == 0:
    timescale, duration = struct.unpack(">II", mdhd[20:28])
else:
    timescale, duration = struct.unpack(">IQ", mdhd[28:40])

stsd = get_box(stbl, 8, len(stbl), "stsd")
stts = get_box(stbl, 8, len(stbl), "stts")
stsc = get_box(stbl, 8, len(stbl), "stsc")
stsz = get_box(stbl, 8, len(stbl), "stsz")
stco = get_box(stbl, 8, len(stbl), "stco")
smhd = get_box(minf, 8, len(minf), "smhd")
dinf = get_box(minf, 8, len(minf), "dinf")
hdlr = get_box(mdia, 8, len(mdia), "hdlr")
assert all([stsd, stts, stsc, stsz, stco, smhd, hdlr]), "missing stbl boxes"

default_size, count = struct.unpack(">II", stsz[12:20])
sizes = [default_size] * count if default_size else list(
    struct.unpack(">%dI" % count, stsz[20:20 + 4 * count]))

n = struct.unpack(">I", stsc[12:16])[0]
stsc_entries = [struct.unpack(">III", stsc[16 + 12 * i:28 + 12 * i]) for i in range(n)]

nchunk = struct.unpack(">I", stco[12:16])[0]
chunk_offs = list(struct.unpack(">%dI" % nchunk, stco[16:16 + 4 * nchunk]))

chunks = []
sample_i = 0
for ci in range(nchunk):
    spc = None
    for fc, s_, sdi in stsc_entries:
        if ci + 1 >= fc:
            spc = s_
    assert spc, "bad stsc"
    base = chunk_offs[ci]
    parts = []
    acc = 0
    for k in range(spc):
        if sample_i >= count:
            break
        sz = sizes[sample_i]
        parts.append(buf[base + acc:base + acc + sz])
        acc += sz
        sample_i += 1
    chunks.append(parts)
assert sample_i == count, "sample count mismatch: %d/%d" % (sample_i, count)


def box(typ, payload):
    return struct.pack(">I4s", len(payload) + 8, typ.encode("latin1")) + payload


MATRIX = struct.pack(">9I", 0x00010000, 0, 0, 0, 0x00010000, 0, 0, 0, 0x40000000)


def make_mvhd(ts_, dur):
    p = struct.pack(">B3s", 0, b"\x00\x00\x00")
    p += struct.pack(">II", 0, 0)
    p += struct.pack(">II", ts_, dur)
    p += struct.pack(">I", 0x00010000)
    p += struct.pack(">H", 0x0100)
    p += b"\x00\x00" + b"\x00" * 8
    p += MATRIX + b"\x00" * 24
    p += struct.pack(">I", 2)
    return box("mvhd", p)


def make_tkhd(dur):
    p = struct.pack(">B3s", 0, b"\x00\x00\x07")
    p += struct.pack(">II", 0, 0)
    p += struct.pack(">I", 1) + struct.pack(">I", 0) + struct.pack(">I", dur)
    p += b"\x00" * 8
    p += struct.pack(">hhH", 0, 0, 0x0100) + b"\x00\x00"
    p += MATRIX + struct.pack(">II", 0, 0)
    return box("tkhd", p)


def make_stco(offsets):
    p = struct.pack(">B3s", 0, b"\x00\x00\x00")
    p += struct.pack(">I", len(offsets))
    p += struct.pack(">%dI" % len(offsets), *offsets)
    return box("stco", p)


def build_moov(chunk_abs):
    stbl_new = box("stbl", stsd + stts + stsc + stsz + make_stco(chunk_abs))
    minf_new = box("minf", smhd + dinf + stbl_new)
    mdia_new = box("mdia", mdhd + hdlr + minf_new)
    trak_new = box("trak", make_tkhd(duration) + mdia_new)
    return box("moov", make_mvhd(timescale, duration) + trak_new)


ftyp = None
for t, o, s in top:
    if t == "ftyp":
        ftyp = buf[o:o + s]
if ftyp is None:
    ftyp = box("ftyp", b"M4A " + struct.pack(">I", 512) + b"M4A mp42isom")

dummy = build_moov([0] * nchunk)
cursor = len(ftyp) + len(dummy) + 8
abs_offs = []
for parts in chunks:
    abs_offs.append(cursor)
    cursor += sum(len(p) for p in parts)
moov_new = build_moov(abs_offs)
assert len(moov_new) == len(dummy), "moov size drift"

mdat = box("mdat", b"".join(b"".join(parts) for parts in chunks))
out = ftyp + moov_new + mdat
os.makedirs(os.path.dirname(os.path.abspath(OUT)), exist_ok=True)
open(OUT, "wb").write(out)
print("timescale=%d duration=%.2fs samples=%d -> %s (%d bytes)" % (
    timescale, duration / timescale, count, OUT, len(out)))
