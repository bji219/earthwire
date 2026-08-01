#!/usr/bin/env python3
"""
Test the Freesound → AIFF export pipeline in Python.

Usage:
  python3 test_freesound_export.py <mp3-url>

<mp3-url> can be:
  - The proxy URL from the running dev server:
      http://localhost:5173/api/freesound?action=download&url=https%3A%2F%2Fcdn.freesound.org%2F...
  - Any direct MP3 URL (must be accessible without auth)

The script mirrors exactly what the browser does:
  1. Download the MP3 bytes
  2. Decode to PCM via ffmpeg (same data the browser's decodeAudioData would produce)
  3. Print diagnostics: sample rate, channels, duration, first samples, peak
  4. Resample to 44100 Hz (OP-1 export target)
  5. Downmix to stereo (OP-1 field default)
  6. Normalize peak to 0.9
  7. Encode to AIFF
  8. Play via afplay
"""

import sys, struct, subprocess, tempfile, os, math
from urllib.request import urlopen, Request

TARGET_SR = 44100
TARGET_CH = 2      # op1field stereo; change to 1 for op1 mono
BIT_DEPTH = 24     # op1field 24-bit; change to 16 for op1
OUT_PATH  = '/tmp/freesound_test.aif'


# ── Download ────────────────────────────────────────────────────────────────

def download(url: str) -> bytes:
    print(f'[1] Downloading: {url[:100]}...')
    req = Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urlopen(req, timeout=30) as r:
        data = r.read()
    print(f'    {len(data):,} bytes received')
    return data


# ── Decode MP3 → PCM via ffmpeg ─────────────────────────────────────────────

def decode_mp3(mp3_bytes: bytes) -> tuple[list, int]:
    """Returns (channels: list[np.array], sample_rate: int)."""
    import numpy as np

    with tempfile.NamedTemporaryFile(suffix='.mp3', delete=False) as f:
        f.write(mp3_bytes)
        tmp = f.name

    try:
        # First pass: get metadata
        probe = subprocess.run(
            ['ffprobe', '-v', 'error', '-select_streams', 'a:0',
             '-show_entries', 'stream=sample_rate,channels',
             '-of', 'csv=p=0', tmp],
            capture_output=True, text=True, check=True
        )
        parts = probe.stdout.strip().split(',')
        src_sr, src_ch = int(parts[0]), int(parts[1])
        print(f'[2] Source: {src_sr} Hz, {src_ch} ch')

        # Second pass: decode to raw f32le interleaved PCM
        raw = subprocess.run(
            ['ffmpeg', '-i', tmp, '-f', 'f32le', '-acodec', 'pcm_f32le', '-'],
            capture_output=True, check=True
        ).stdout

        samples = np.frombuffer(raw, dtype=np.float32)
        # De-interleave into channels
        channels = [samples[ch::src_ch] for ch in range(src_ch)]
        duration = len(channels[0]) / src_sr
        print(f'    Duration: {duration:.3f}s, frames: {len(channels[0]):,}')

        return channels, src_sr
    finally:
        os.unlink(tmp)


# ── Print diagnostics ────────────────────────────────────────────────────────

def print_diagnostics(channels: list, label='decoded'):
    import numpy as np
    ch0 = channels[0]
    peak = float(np.max(np.abs(ch0)))
    rms  = float(np.sqrt(np.mean(ch0 ** 2)))
    first10 = ch0[:10].tolist()
    print(f'[diag:{label}] peak={peak:.6f}  rms={rms:.6f}')
    print(f'[diag:{label}] first10={[f"{x:.5f}" for x in first10]}')
    if peak < 0.0001:
        print(f'  *** WARNING: effectively SILENT ({peak:.2e}) ***')
    else:
        db = 20 * math.log10(peak)
        print(f'  Peak = {db:.1f} dBFS')


# ── Resample (linear interpolation, mirrors trimBuffer) ─────────────────────

def resample_channel(src, src_sr: int, target_sr: int):
    import numpy as np
    if src_sr == target_sr:
        return src.copy()
    ratio = src_sr / target_sr
    target_frames = max(1, round(len(src) / ratio))
    indices = np.arange(target_frames) * ratio
    idx = np.floor(indices).astype(int)
    frac = indices - idx
    idx_next = np.minimum(idx + 1, len(src) - 1)
    return src[idx] + (src[idx_next] - src[idx]) * frac


# ── Downmix / channel conversion ─────────────────────────────────────────────

def convert_channels(channels: list, target_ch: int):
    src_ch = len(channels)
    if target_ch == 1:
        if src_ch == 1:
            return [channels[0].copy()]
        return [(channels[0] + channels[1]) * 0.5]
    else:  # stereo out
        if src_ch == 1:
            return [channels[0].copy(), channels[0].copy()]
        return [ch.copy() for ch in channels[:2]]


# ── Normalize ────────────────────────────────────────────────────────────────

def normalize(channels: list, target_peak=0.9):
    import numpy as np
    peak = max(float(np.max(np.abs(ch))) for ch in channels)
    if peak < 0.0001:
        print('  *** normalize: peak below threshold — leaving silent ***')
        return
    gain = target_peak / peak
    for ch in channels:
        ch *= gain
    print(f'[3] Normalized: peak {peak:.4f} → {target_peak} (gain ×{gain:.3f})')


# ── Encode AIFF ──────────────────────────────────────────────────────────────

SAMPLE_RATE_BYTES = {
    44100: bytes([0x40, 0x0E, 0xAC, 0x44, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
    48000: bytes([0x40, 0x0E, 0xBB, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
}

def encode_aiff(channels: list, sample_rate: int, bit_depth: int) -> bytes:
    import numpy as np
    num_ch = len(channels)
    num_frames = len(channels[0])
    bytes_per = bit_depth // 8

    # Interleave channels
    interleaved = np.empty(num_frames * num_ch, dtype=np.float32)
    for i, ch in enumerate(channels):
        interleaved[i::num_ch] = ch

    # Convert to PCM bytes
    clamped = np.clip(interleaved, -1.0, 1.0)
    pcm = bytearray()
    if bit_depth == 16:
        vals = np.round(clamped * 32767).astype(np.int16)
        for v in vals:
            pcm += struct.pack('>h', int(v))
    else:  # 24-bit
        scale = np.where(clamped < 0, 8388608, 8388607)
        vals = np.round(clamped * scale).astype(np.int32)
        for v in vals:
            v = int(v)
            pcm += bytes([(v >> 16) & 0xFF, (v >> 8) & 0xFF, v & 0xFF])
    pcm = bytes(pcm)

    sr_bytes = SAMPLE_RATE_BYTES[sample_rate]
    comm_size = 18
    ssnd_size = 8 + len(pcm)
    form_content = 4 + (8 + comm_size) + (8 + ssnd_size)
    total = 8 + form_content

    buf = bytearray(total)
    o = 0
    def tag(s): return s.encode('ascii')
    def w4(v): return struct.pack('>I', v)
    def w2(v): return struct.pack('>H', v)
    def s2(v): return struct.pack('>h', v)

    buf[o:o+4] = tag('FORM'); o += 4
    buf[o:o+4] = w4(form_content); o += 4
    buf[o:o+4] = tag('AIFF'); o += 4

    buf[o:o+4] = tag('COMM'); o += 4
    buf[o:o+4] = w4(comm_size); o += 4
    buf[o:o+2] = s2(num_ch); o += 2
    buf[o:o+4] = w4(num_frames); o += 4
    buf[o:o+2] = s2(bit_depth); o += 2
    buf[o:o+10] = sr_bytes; o += 10

    buf[o:o+4] = tag('SSND'); o += 4
    buf[o:o+4] = w4(ssnd_size); o += 4
    buf[o:o+4] = w4(0); o += 4  # offset
    buf[o:o+4] = w4(0); o += 4  # blockSize
    buf[o:o+len(pcm)] = pcm

    return bytes(buf)


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    url = sys.argv[1]
    import numpy as np

    mp3_bytes = download(url)
    channels, src_sr = decode_mp3(mp3_bytes)

    print_diagnostics(channels, 'after-decode')

    # Resample each channel to target SR
    resampled = [resample_channel(ch, src_sr, TARGET_SR) for ch in channels]
    print(f'    Resampled {src_sr} → {TARGET_SR} Hz, frames: {len(resampled[0]):,}')

    # Channel conversion
    out_channels = convert_channels(resampled, TARGET_CH)
    print(f'    Channels: {len(channels)} → {TARGET_CH}')

    print_diagnostics(out_channels, 'after-resample')

    normalize(out_channels, 0.9)
    print_diagnostics(out_channels, 'after-normalize')

    aiff = encode_aiff(out_channels, TARGET_SR, BIT_DEPTH)
    with open(OUT_PATH, 'wb') as f:
        f.write(aiff)
    print(f'[4] Wrote {len(aiff):,} bytes to {OUT_PATH}')

    print('[5] Playing via afplay...')
    subprocess.run(['afplay', OUT_PATH])
    print('    Done.')


if __name__ == '__main__':
    main()
