#!/usr/bin/env python3
"""Deterministic offline evidence renderer for the presentation trace seam.
It does not claim browser playback: it turns cue timing into a reproducible WAV
for envelope/spectral regression evidence when an OfflineAudioContext capture is unavailable.
"""
import argparse, json, math, struct, wave
from pathlib import Path

FREQUENCIES = {
  'title-terminal': 40, 'briefing-loading': 55, 'gameplay-pressure': 62,
  'slingshotEngage': 294, 'slingshotRelease': 392, 'loot': 330,
  'portalProximity': 330, 'portalReady': 392, 'portalAbort': 294, 'portalConfirm': 392,
  'portalBlocked': 176, 'hullWarning': 146, 'fuelWarning': 118, 'signalWarning': 164,
  'inhibitorGlitch': 622, 'inhibitorWake': 466, 'death': 92, 'extract': 294, 'results': 73,
}

def main():
  ap=argparse.ArgumentParser(); ap.add_argument('trace'); ap.add_argument('--out', required=True); ap.add_argument('--rate', type=int, default=48000); args=ap.parse_args()
  trace=json.loads(Path(args.trace).read_text()); events=trace['events']; duration=max([e.get('at',0)+1.8 for e in events] or [1]); frames=int(duration*args.rate); samples=[0.0]*frames
  for index,event in enumerate(events):
    start=int(event.get('at',0)*args.rate); freq=FREQUENCIES.get(event['cue'], 220); length=min(int(args.rate*(1.25 if event['cue']=='portalReady' else .42)), frames-start)
    seed=sum(ord(c) for c in event.get('id',''))
    for n in range(max(0,length)):
      t=n/args.rate; env=min(1,n/max(1,int(.018*args.rate)))*math.exp(-t*(1.35 if event['cue']=='portalReady' else 8))
      # cyan/amber/red/magenta families stay center-readable; light deterministic grain adds material.
      tone=math.sin(2*math.pi*freq*t)
      if event['cue'] in ('loot','extract'): tone += .45*math.sin(2*math.pi*freq*1.49*t)
      if event['cue'] in ('hullWarning','fuelWarning','signalWarning','death','portalBlocked'): tone += .25*math.sin(2*math.pi*freq*.9375*t)
      if event['cue'].startswith('inhibitor'): tone += .24*math.sin(2*math.pi*freq*1.414*t)
      grain=(((seed + n*1103515245) & 0xffff)/32768-1)*.028
      samples[start+n]+= (tone*.16+grain)*env
  peak=max(max(map(abs,samples)),1e-9); norm=.82/peak
  out=Path(args.out); out.parent.mkdir(parents=True,exist_ok=True)
  with wave.open(str(out),'wb') as wav:
    wav.setnchannels(1); wav.setsampwidth(2); wav.setframerate(args.rate)
    wav.writeframes(b''.join(struct.pack('<h',max(-32767,min(32767,int(x*norm*32767)))) for x in samples))
  print(json.dumps({'trace':str(args.trace),'wav':str(out),'sample_rate':args.rate,'channels':1,'duration_sec':duration,'events':len(events),'renderer':'deterministic-offline-trace-v1'},indent=2))
if __name__=='__main__': main()
