# Glossary

Use only these terms in specs, copy, code names and tests.

| Term | Meaning | Not |
|---|---|---|
| **Project** | Everything being edited in one session: the clips, text, audio and frame settings (ENT-Project). Exists only while the page is open. | document, file |
| **Source** | A media file the user added: a video, photo or audio file (ENT-Source). Never changed. | asset, upload |
| **Media panel** | Where added sources are listed before and after they are placed on the timeline. | library, bin |
| **Timeline** | The time-ordered view of the project with its tracks and the playhead. | sequence |
| **Main track** | The track of clips that make up the picture. Clips sit end to end with no gaps (INV-03). | video track |
| **Clip** | A video or photo segment on the main track (ENT-Clip). A video clip uses a range of its source. | segment |
| **Text layer** | A piece of text shown over the picture between a start and an end time (ENT-TextLayer). | caption, title (titles are text layers) |
| **Audio track** | The track holding audio clips: music and other sound from the user's audio files. | music track |
| **Audio clip** | A range of an audio source placed on the audio track (ENT-AudioClip). | |
| **Playhead** | The current time in the project, shown in the preview and on the timeline. | cursor |
| **Preview** | The picture of the project at the playhead, played or paused. | viewer, monitor |
| **Frame** (of the project) | The output picture's shape and timing: its aspect ratio, frame rate and background (RULE-04). Resolution is chosen at export (RULE-15). | canvas, crop |
| **Fit / Fill** | How a clip is placed in the frame: fit shows all of it with background around it; fill covers the frame, cutting off what doesn't fit (RULE-07). | |
| **Adjustment** | A numeric colour or light control on a clip: brightness, contrast, saturation and so on (RULE-08). | effect |
| **Look** | A named colour filter with an intensity (RULE-09). | preset, LUT |
| **Fade** | A gradual change from or to the background (picture) or silence (sound) at a clip's start or end (RULE-10). | |
| **Cross-fade** | A blend between two adjacent clips on the main track (RULE-10). | transition |
| **Speed** | How fast a clip plays relative to its source (RULE-06). | |
| **Trim** | Changing where a clip starts or ends within its source, or a photo's duration. | cut |
| **Split** | Dividing one clip into two at the playhead. | cut |
| **Export** | Rendering the project to a file the user saves: video, animated image or audio (RULE-15, RULE-16). | render, publish |
| **Scratch space** | Temporary on-device storage used only during an export, deleted when it ends (PRN-01). | cache |
| **Session** | From opening the tool until the page closes. A new project (RULE-23) starts a new project, not a new session. | |
| **Host** | The portal page that embeds the tool. | parent |
| **Unexported changes** | Edits made since the project was last exported (RULE-19). | unsaved |
