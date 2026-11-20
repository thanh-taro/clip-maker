# Owner checklist — QA (phase 5)

About 60–90 minutes in total; do it in any order, over several sittings. Note **pass / fail + a word on what you saw** next to each line (or just tell Claude). Android is skipped (QA-4).

## 0. Setup (once)
- Mac: close the VM and other heavy apps for the timing checks (section 4).
- iPhone: the trusted certificate from phase 3 should still be installed (Settings › General › About › Certificate Trust Settings shows "mkcert"). If not, tell Claude — Claude will not install certificates for you.
- Start the app for the phone: Claude gives you one command (`pnpm preview:lan`) and the two addresses:
  - standalone: `https://192.168.1.7:4173/`
  - inside a stand-in portal page: the second address it prints.
- Same Wi-Fi for Mac and iPhone. Keep the iPhone's screen on.
- Copy `~/clip-maker-fixtures/gen/long-4gb.mov` to the iPhone (AirDrop → Save to Files) for check 4.4.

## 1. iPhone — Safari, standalone address
1. Add 3 videos from Photos; choose 9:16; trim, split, add a look, a title, music; export 1080p. The file saves (Files / Photos). *(FLOW-01)*
2. Full screen on the preview: it fills the screen (or maximises inside the page); the control or swipe-down leaves it. *(Q80)*
3. Adjust sheet: tap the Brightness number, type **−20** with the keyboard's minus key; it shows −20. *(Q138, Q143)*
4. Drag the Brightness slider slowly across the middle: it "sticks" at 0. *(Q140)*
5. Add text: the text bar sits right above the on-screen keyboard, and the preview stays visible above it. *(Q168)*
6. After an export, **Share** opens the iPhone share sheet. *(Q187)*
7. Make a change, don't export, close the tab: Safari asks whether to leave. *(Q194)*
8. Touch: hold a clip ~0.4 s then drag — it moves; a quick swipe on the timeline scrubs. Pinch the timeline to zoom; a swipe while playing pauses and scrubs; a tap stops the glide. *(Q209, Q180)*
9. Pinch a clip in the preview with two fingers — it scales; lift one finger — the pinch ends. *(Q137)*

## 2. iPhone — inside the stand-in portal page
1. The tool opens inside the page; theme and language follow the page.
2. Add text: the text bar still sits above the keyboard. *(Q168)*
3. After an export there is **no** Share button (the frame isn't allowed to share). *(Q189)*
4. Make a change and close the tab: **no** leave warning from the tool. *(Q194)*

## 3. Mac — Safari
1. Cmd+O opens the file picker. Option+Tab reaches the timeline clips (Tab alone does too only if Safari › Settings › Advanced › "Press Tab to highlight each item" is on). *(Q92)*
2. Leave warning: standalone yes, in the portal page no. *(Q194)*
3. Export a short clip and open it in QuickTime and Photos: colours look the same as the preview (not washed out or too dark). *(Q39)*
4. Firefox (if installed): open the app, add a clip, export — it works, or shows the "not supported" screen with reasons. *(NFR-12)*

## 4. Timings and memory (reference Mac and iPhone 14 Pro, other apps closed)
1. Start-up: reload the page — it accepts a file within 2 s on the Mac, 3 s on the iPhone. *(NFR-02)*
2. Play a 1080p project with a look and every adjustment on: smooth, no visible stutter. *(NFR-03, Q143)*
3. Export a 60 s 1080p30 project: under 60 s on the Mac, under 120 s on the iPhone. Note both times. *(NFR-04, Q188)*
4. iPhone: add `long-4gb.mov`, scrub through it, play, export a 30 s part. The page must not reload or crash. *(F-001.AC9, NFR-05)*
5. iPhone: add 2 normal videos and play/export — if one fails with "couldn't read", note which file. *(Q25)*
6. Music estimate: with real music on the timeline, note the "about X MB" figure before export and the real size after. *(Q45)*

## 5. Screen reader (VoiceOver) — short pass
The 15-step list is at the end of `.build-my-app/reports/qa-a11y.md`. Do it after the accessibility fixes land (Claude will say when).
