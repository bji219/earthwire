#!/usr/bin/env python3
"""
Diagnostic: build a kit file using 808.aif as a complete template,
replacing only the SSND audio (with our exported audio) and recomputing
start/end positions to match. Everything else (FVER, COMM header, all
APPL fields except start/end/name/mtime) is byte-identical to 808.aif.

If this file loads correctly on the OP-1 Field, our remaining APPL fields
are wrong. If it doesn't load correctly, the issue is in the audio data
or layout — not the APPL.

Usage:
  python3 frankenstein_kit.py <our_export.aif>
  → produces ~/Desktop/frankenstein.aif
"""
import struct, json, os, sys, math, time

OP1_MAX = 0x7ffffffe
SR = 44100
SCALE = OP1_MAX / (SR * 20)

def parse_aif(path):
    with open(path, 'rb') as f:
        data = f.read()
    chunks = {}  # cid -> (start, size, payload)
    pos = 12
    while pos + 8 <= len(data):
        cid = data[pos:pos+4].decode('ascii', errors='replace')
        csz = struct.unpack('>I', data[pos+4:pos+8])[0]
        chunks[cid] = (pos, csz, data[pos+8:pos+8+csz])
        pos += 8 + csz + (csz & 1)
    return data[:12], chunks

def main():
    src_export = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser('~/Desktop/earthwire_test_export.aif')
    template   = '/Users/BrendanInglis/Desktop/808.aif'

    if not os.path.exists(src_export):
        print(f"missing: {src_export}")
        sys.exit(1)
    if not os.path.exists(template):
        print(f"missing template: {template}")
        sys.exit(1)

    _, src_chunks = parse_aif(src_export)
    _, tpl_chunks = parse_aif(template)

    # Pull our SSND audio + start/end positions
    our_ssnd = src_chunks['SSND'][2]  # includes 8-byte offset/blockSize header + audio
    our_audio = our_ssnd[8:]
    our_appl = json.loads(src_chunks['APPL'][2][4:].rstrip(b'\x00 \r\n\t'))

    # Decode our COMM frames
    our_comm = src_chunks['COMM'][2]
    our_frames = struct.unpack('>I', our_comm[2:6])[0]

    # Load template metadata
    tpl_appl_raw = tpl_chunks['APPL'][2]
    tpl_meta = json.loads(tpl_appl_raw[4:].rstrip(b'\x00 \r\n\t'))
    tpl_comm = tpl_chunks['COMM'][2]
    tpl_frames = struct.unpack('>I', tpl_comm[2:6])[0]

    print(f"Source export: {our_frames:,} frames, {len(our_audio):,} audio bytes")
    print(f"Template 808 : {tpl_frames:,} frames, {len(tpl_chunks['SSND'][2])-8:,} audio bytes")

    # Strategy: keep 808.aif's full APPL JSON, but overwrite start/end
    # with positions matching OUR audio's layout. Keep our 1-frame silence
    # convention for empty slots.
    new_starts = list(our_appl['start'])
    new_ends   = list(our_appl['end'])
    print(f"Using start/end from our export ({sum(1 for s,e in zip(new_starts,new_ends) if s!=e)} filled)")

    # Replace in template metadata
    tpl_meta['start']  = new_starts
    tpl_meta['end']    = new_ends
    tpl_meta['name']   = 'frankenstein'
    tpl_meta['mtime']  = int(time.time())

    # Re-encode APPL JSON to exactly 4096 bytes (padded with spaces)
    json_str = json.dumps(tpl_meta, separators=(',', ':'))
    json_bytes = json_str.encode('utf-8')
    if len(json_bytes) > 4096:
        print(f"JSON too large: {len(json_bytes)} bytes")
        sys.exit(1)
    block = bytearray(b' ' * 4096)
    block[:len(json_bytes)] = json_bytes
    appl_payload = b'op-1' + bytes(block)

    # Build new COMM with OUR frame count but template's compressionType/Name
    new_comm = (
        tpl_comm[:2] +               # numChannels (2 bytes) — keep template (stereo)
        struct.pack('>I', our_frames) +  # our frame count
        tpl_comm[6:]                 # bitDepth, sampleRate, compressionType, name
    )
    assert len(new_comm) == len(tpl_comm)

    # Build new SSND with our audio
    new_ssnd_payload = b'\x00' * 8 + our_audio

    # Assemble AIFC: FORM + AIFC + FVER + COMM + APPL + SSND
    fver = tpl_chunks['FVER'][2]
    body = b'AIFC'
    body += b'FVER' + struct.pack('>I', len(fver)) + fver
    body += b'COMM' + struct.pack('>I', len(new_comm)) + new_comm
    body += b'APPL' + struct.pack('>I', len(appl_payload)) + appl_payload
    body += b'SSND' + struct.pack('>I', len(new_ssnd_payload)) + new_ssnd_payload

    form = b'FORM' + struct.pack('>I', len(body)) + body

    out = '/Users/BrendanInglis/Desktop/frankenstein.aif'
    with open(out, 'wb') as f:
        f.write(form)

    print(f"\nWritten: {out} ({len(form):,} bytes)")
    print(f"  - SSND audio: from your export ({our_frames:,} frames)")
    print(f"  - APPL fields: all 808.aif's values EXCEPT start/end (yours), name, mtime")
    print(f"  - start[0]={new_starts[0]}, end[0]={new_ends[0]}")

if __name__ == '__main__':
    main()
