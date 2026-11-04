# Owner device checklist (phase 3 spikes)

Worktrees live under `/Users/er_lap_mam3_016/Documents/personals/taro-kit-tools/media-tools/clip-maker/.claude/worktrees/`. The Mac's LAN address is `192.168.1.15`.

**Run one server at a time** (Ctrl+C before starting the next). On the iPhone, keep the screen on and Auto-Lock off.

## 0. One-time setup
- On the Mac, run `/opt/homebrew/bin/mkcert -install`. In Firefox, open `about:config` and set `security.enterprise_roots.enabled` to `true`.
- On the iPhone:
  1. AirDrop `~/Library/Application Support/mkcert/rootCA.pem` to it. Never send the `-key.pem`.
  2. Install it from Settings › Profile Downloaded.
  3. Turn on full trust in Settings › General › About › Certificate Trust Settings.
- If the Mac's IP has changed, run `LAN_IP=<ip> npm run cert` in each spike folder.
- Close other heavy apps for the timing spikes: compositor, gpu-color, speed and size-target.

## 1. Runs
| # | Spike | Folder (in worktrees/) | Start | Mac (Safari, Firefox, Chrome) | iPhone | Results go to |
|---|---|---|---|---|---|---|
| 1 | SP-codec | `agent-a7337bbdfecf7d50f/spikes/codec` | `npm run serve` | https://localhost:8443/ → Download matrix JSON | https://192.168.1.15:8443/ | `results/` |
| 2 | SP-frame | `agent-a2849a1417d411d4d/spikes/frame` | `npm run serve` (Mac) · `npm run serve:https` (iPhone) | http://localhost:5181/ · http://localhost:5180/?tool=http://localhost:5181 · http://127.0.0.1:5180/?tool=http://localhost:5181 (Safari and Firefox) | https://192.168.1.15:8444/ · https://192.168.1.15:8443/?tool=https://192.168.1.15:8444 | `results/manual/` |
| 3 | SP-compositor | `agent-ad08c34f155092fe4/spikes/compositor` | `npm run serve` | https://localhost:8444/ → Run (~25 min) → Download | https://192.168.1.15:8444/?avmin=3 (if it reloads, use `?avmin=1`) | `results/` |
| 4 | SP-audio | `agent-aeec76a3b773a9df1/spikes/audio` | `npm run serve` | https://localhost:8451/play.html and `/export.html` | same on 192.168.1.15:8451, once normal and once in Low Power Mode | saved automatically |
| 5 | SP-gpu-color | `agent-a96ec5ca84396aa40/spikes/gpu-color` | `npm run serve` | https://localhost:8445 → Download JSON. Then open the chart MP4 in QuickTime, Photos and VLC: do the colours match? | https://192.168.1.15:8445 | `results/` |
| 6 | SP-timestretch | `agent-aa6fe40814866e5ed/spikes/timestretch` | `npm run serve` | https://localhost:8452/listen.html: blind A/B with one other person | https://192.168.1.15:8452/bench.html | `results/` |
| 7 | SP-speed | `agent-a7cfb1d74c7b86d5e/spikes/speed` | `npm run serve` | https://localhost:8446/?runs=base,base,base,serial,hybrid | https://192.168.1.15:8446/?runs=base,base,base,hybrid | `results/` |
| 9 | SP-size-target | `agent-a5db471f88fc57b5b/spikes/size-target` | `npm run serve` | https://localhost:8447/ → then compare `results/floors/*.webp` with the `-ref` stills (are the floors acceptable?) | https://192.168.1.15:8447/?fixtures=nfr04,screen&parts=quality,target | `results/` |
| 8 | SP-storage | `agent-a065ad82bffb86d7a/spikes/storage` | see `README.md` | Safari and Firefox per README | per README | per README |

AirDrop the iPhone's JSON files to the Mac and put them in the matching `results` folder.

## 2. Sample clips (for the remaining phone spikes: memory, iPhone behaviour, HDR)
Record these on the iPhone and put them in a folder outside git, for example `~/clip-maker-fixtures/`:
- 4K HDR (the default camera setting), 10–20 s
- 4K with HDR off, 10–20 s
- 1080p, 3–10 min
- a short macOS screen recording at full Retina resolution

Then tell Claude the folder path.

## 3. When done
Tell Claude which runs you did, and mention anything odd (a page reload, a download prompt, a crash).
