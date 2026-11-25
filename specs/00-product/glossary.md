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
| **Colour tool** | One of five colour controls on a clip beyond the adjustments: colour mixer, colour pop, split toning, duotone and colour replace (RULE-24, RULE-25). | effect, filter |
| **Colour range** | One of eight hue bands (red, orange, yellow, green, aqua, blue, purple, magenta) that the colour mixer and colour pop act on (RULE-24). | channel |
| **Colour mixer** | Hue, saturation and lightness controls per colour range (RULE-24). | HSL panel |
| **Colour pop** | Keeps one colour range and turns the rest of the picture grey (RULE-24). | colour splash |
| **Split toning** | A tint for the dark tones and another for the light tones (RULE-24). | |
| **Duotone** | Recolours the picture with a gradient between two colours, by lightness (RULE-24). | gradient map |
| **Colour replace** | Changes one colour of a clip to another, keeping its lightness and shading; matches colour, not objects (RULE-25). | colour key, chroma key |
| **Eyedropper** | Picking a colour by clicking or tapping a point of the preview, or moving a marker with the keyboard (RULE-25). | colour sampler |
| **Hue wheel** | The hues named in degrees by the sRGB colour at full saturation (0° red, 120° green, 240° blue), used by hue sliders and the colour picker (RULE-24). | colour wheel |
| **Hue ring** | The test fixture of 360 colours around the hue at fixed lightness and chroma (RULE-24). | |
| **Pick mode** | The state in which the next click, tap or keyboard pick on the preview sets a colour (RULE-25). | |
| **Colour picker** | The control for choosing any colour: preset swatches, hue, saturation and lightness, or a hex code. | |
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
