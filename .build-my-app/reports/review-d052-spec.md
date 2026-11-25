# Spec review: D-052 (commit f49a668), music only from the user's own files

Lint: `python3 tools/spec_lint.py` reports 847 IDs, 3646 references, 0 errors, 0 warnings.

Leftover-reference grep (bundled, MusicTrack, MusicPicker, COPY-music.*, music_unavailable, audition, music, track, picker):
everything left is in deprecated or retired sections, in the changelog or dependency history, in accepted ADR bodies that now have
amendments, or uses "bundled" for looks or tools. There is one exception, MOD-Audio (M3 below).

## Verdicts
| Item | Verdict |
|---|---|
| F-011 | not ready: needs M1 and M2 (short fixes) |
| RULE-12, RULE-02 | ready |
| FLOW-01 | ready (coherent path; step 7 assumes the user has an audio file, which is fine for PER-02 and PER-03) |
| F-001, F-015, F-020, F-021 | ready after the status fix (M4) |
| NFR-01, NFR-10 | ready |
| ADR-0008, -0013, -0014, -0015 amendments; dependencies.md | ready |
| CMP-Toolbar, CMP-StatusBar, SCR-Editor, copy.md | ready |
| CMP-Inspector | not ready: M2 |
| MOD-Audio | ready after M3 |

Copy: every key that F-011 and the changed components use exists in en-US and vi-VN (COPY-action.music, -mute_all, -unmute_all,
-time_earlier, -time_later, -mute, COPY-sound.volume, COPY-inspector.sound, COPY-notice.no_audio_room, COPY-error.refused_list).
The retired keys are listed only under "Retired (D-052)".

## Blockers
None.

## Major

**M1. No acceptance criterion covers the new "no room" path, or any refusal through Music.** specs/20-features/F-011-music-sound.md:53-55
The old picker blocked Add when there was no room (CMP-MusicPicker "row / no audio room"). Now the file is taken in, kept as a source,
and only its placement is refused. That is new behaviour, and no AC anywhere in specs/ uses COPY-notice.no_audio_room. The refused-file
and video-through-Music edge cases have no AC either. The case where several files run past the project end is also untested.
Suggested addition:
- **AC14** Given a 20 s project with an audio clip from 0 s to 20 s and the playhead at 5 s, when the user chooses a 10 s MP3 with COPY-action.music, then COPY-notice.no_audio_room shows, the MP3 is listed in the media panel, no audio clip is added, and one undo removes the source. (R1)
- **AC15** Given a 20 s project, an empty audio track and the playhead at 3 s, when the user chooses a 30 s MP3 and then a 10 s MP3 with COPY-action.music, then the first is placed at 3–33 s, the second is listed in the media panel with COPY-notice.no_audio_room and no clip, and one undo removes both sources and the clip. (R1)
- **AC16** Given an empty audio track, when the user chooses a valid MP3 and a PDF renamed .mp3 with COPY-action.music, then the MP3 is placed and COPY-error.refused_list names the PDF with COPY-reason.unsupported. (R1)

**M2. The phone Audio sheet drops audio-clip fades, and the sentence now puts the text tools in the Audio sheet.** specs/30-experience/components/CMP-Inspector.md:26
The new enumeration lists only Volume, Mute, Mute original sound and Earlier/Later. Fade in and Fade out (line 23, F-009.R4) are gone,
so a phone build has no audio fade controls. The sentence also ends "...opens the file picker for audio files (F-011.R1) and the text
tools on CMP-TextEditor", which reads as if the text tools sit in the Audio sheet.
Suggested wording: "...the Looks sheet on CMP-LookGallery, and the text tools on CMP-TextEditor. The Audio sheet holds, while a video or audio clip is selected, that selection's sound section from the wide inspector at touch size at its top (the video clip's Sound tab, or the audio clip row: Volume with Mute, Fade in, Fade out, Earlier and Later), then a full-width touch-size Music button (COPY-action.music) that opens the file picker for audio files (F-011.R1)."

**M3. MOD-Audio still exposes the withdrawn audition API.** specs/40-technical/modules/MOD-Audio.md:42-43
The public surface still lists `audition(trackId, length)` and `auditionStop(t)`, which contradicts line 14 and the ADR-0008 amendment.
Suggested wording: "Audio worker messages: `setProject`, `play(fromT)`, `pause`, `seek(t)` and `feed(port)`: ..." (delete the two audition messages and their parenthesis).

**M4. The changelog and the frontmatter disagree on the status of F-015, F-020 and F-021.** specs/60-delivery/changelog.md:11 vs F-015/F-020/F-021 line 4 and specs/20-features/_index.md
The changelog says "they stay `shipped` and are re-verified with the F-011 rebuild", but the commit sets all three to `ready`. That
contradiction decides whether the build reopens three features. Pick one. Suggested wording if `ready` is intended: "...updated and set
back to `ready`, so they are re-verified with the F-011 rebuild." Otherwise restore `status: shipped` in the three files and in _index.md.

## Minor

**m1. R1 restates the RULE-12 placement and leaves a case out.** F-011-music-sound.md:25
The parenthesis "(at the playhead, or the end of the audio clip there, or at 0 when the playhead is at the project end)" omits "or at 0
when the main track is empty". That repeats one fact in two places. Replace it with "per RULE-12 *Placing on the audio track*".

**m2. Selection is undefined when no audio clip is placed.** F-011-music-sound.md:25
All files might be refused or find no room, or Music might bring in only video or photo files. Add: "If no audio clip is placed, the selection doesn't change."

**m3. "Follow one another" depends on a boundary case that RULE-12 doesn't settle.** F-011-music-sound.md:25; rules.md:33
Say the first file is cut where an existing clip starts. The next file's start then moves only once, to that clip's start, and RULE-12
doesn't say whether a start equal to a clip's start counts as "inside" it. Add to RULE-12: "A start at or inside an audio clip moves to that clip's end, repeatedly, until it is free." Alternatively, state that the file is refused.
With several refusals, also say whether there is one COPY-notice.no_audio_room or one per file. Suggested: "one notice for the pick".

**m4. "Track title" no longer fits user audio.** specs/30-experience/style.md:27 (and the "title chip" in CMP-Timeline.md:12,20,30)
Audio clips now always come from a source. Write "the source's name" instead of "the track title".

**m5. Glossary vocabulary.** F-011-music-sound.md:18,30,31,40,41
"ships no tracks" uses "track" for a song, which collides with main track and audio track. Use "ships no music" or "ships no songs".

**m6. A non-deprecated item references the deprecated component.** specs/30-experience/copy.md:419
"(CMP-MusicPicker, deprecated)". README.md:79 says deprecated items must not be referenced by non-deprecated ones. Write "(the music picker, removed by D-052)".
