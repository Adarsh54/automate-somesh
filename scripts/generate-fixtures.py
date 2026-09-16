"""Deterministic, non-copyrighted integration fixtures. Run with Python + ffmpeg.
Usage: python scripts/generate-fixtures.py /tmp/cuebook-fixtures /path/to/ffmpeg
Generated media is intentionally not committed.
"""
import array
import json
import math
from pathlib import Path
import subprocess
import sys
import wave

out = Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
ffmpeg = sys.argv[2]
sr = 16000

def music(seconds, seed):
    values = array.array('f'); phase = 0
    for i in range(round(seconds * sr)):
        t = i / sr; note = int(t * 4)
        frequency = 110 + (((note + seed * 7919) * 1103515245 >> 8) ^ (note * seed * 3571)) % 380
        phase += 2 * math.pi * frequency / sr
        envelope = min(1, t * 10, (seconds - t) * 10)
        values.append((math.sin(phase) * .3 + math.sin(phase * 1.503) * .12) * envelope)
    return values

def write(name, values):
    with wave.open(str(out / name), 'wb') as f:
        f.setnchannels(1); f.setsampwidth(2); f.setframerate(sr)
        f.writeframes(array.array('h', (round(max(-1, min(1, x)) * 32767) for x in values)).tobytes())

a = music(8, 1); b = music(5, 2)
write('cue-a.wav', a); write('cue-b.wav', b); write('unmatched.wav', music(6, 99))
score = array.array('f', [0]) * (20 * sr)
score[2*sr:6*sr] = a[:4*sr]; score[12*sr:15*sr] = b[:3*sr]
write('score.wav', score)
movie = array.array('f', (math.sin(i*.367) * .008 + math.sin(i*.17991) * .005 for i in range(600*sr)))
placements = [(a, 15, 0, 8), (a, 125, 0, 8), (a, 210, 2, 6), (b, 325, 0, 5), (a, 550, 0, 8)]
for cue, start, cue_in, cue_out in placements:
    for i, value in enumerate(cue[cue_in*sr:cue_out*sr]): movie[start*sr+i] += value * .6
write('movie-audio.wav', movie)
subprocess.run([ffmpeg, '-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0x234d3d:s=160x90:r=24:d=600', '-i', str(out/'movie-audio.wav'), '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '35', '-c:a', 'aac', '-b:a', '64k', '-shortest', '-movflags', '+faststart', str(out/'movie.mp4')], check=True)
(out/'expected.json').write_text(json.dumps({'duration':600,'fileStart':'00:59:55:00','rate':'24','cue-a':[[15,23],[125,133],[210,214],[550,558]],'cue-b':[[325,330]],'score':[[2,6],[12,15]]}, indent=2))
print(f'Generated 10-minute MP4/AAC movie, references, silence-gap score and expected positions in {out}')
