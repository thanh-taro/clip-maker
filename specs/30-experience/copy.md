# Copy

Tone: short, plain and specific. Say what happened and what to do next.

Rules for every string:
- Placeholders go in `{braces}`. There is one text column per supported language (RULE-18), and every language has the same placeholders.
- These stay as written in every language: the product name, "GIF", "MP4", "WAV", "MB" and "GitHub".
- Numbers and durations in placeholders are formatted for the active language.
- Draft texts. Phase 2 refines them and completes the Vietnamese.

## Actions
| ID | en-US | vi-VN | Notes |
|---|---|---|---|
| **COPY-action.add_media** | Add media | Thêm tệp | Video, photo or audio |
| **COPY-action.add_text** | Add text | Thêm chữ | |
| **COPY-action.add_crossfade** | Cross-fade | Chuyển mờ | Between two clips |
| **COPY-action.split** | Split | Tách | |
| **COPY-action.set_in** | Start here | Bắt đầu tại đây | Trim the start to the playhead |
| **COPY-action.set_out** | End here | Kết thúc tại đây | Trim the end to the playhead |
| **COPY-action.delete** | Delete | Xoá | |
| **COPY-action.duplicate** | Duplicate | Nhân bản | |
| **COPY-action.move_left** | Move earlier | Dời lên trước | |
| **COPY-action.move_right** | Move later | Dời ra sau | |
| **COPY-action.rotate** | Rotate | Xoay | 90° clockwise |
| **COPY-action.flip_h** | Flip horizontal | Lật ngang | |
| **COPY-action.flip_v** | Flip vertical | Lật dọc | |
| **COPY-action.reset** | Reset | Đặt lại | |
| **COPY-action.reset_all** | Reset all | Đặt lại tất cả | |
| **COPY-action.apply_all** | Apply to all clips | Áp dụng cho mọi clip | |
| **COPY-action.copy_look** | Copy colour | Sao chép màu | Adjustments and look |
| **COPY-action.paste_look** | Paste colour | Dán màu | |
| **COPY-action.compare** | Hold to compare | Giữ để so sánh | Shows the original while held |
| **COPY-action.mute_all** | Mute original sound | Tắt tiếng gốc | All main-track clips |
| **COPY-action.undo** | Undo | Hoàn tác | |
| **COPY-action.redo** | Redo | Làm lại | |
| **COPY-action.new_project** | New project | Dự án mới | |
| **COPY-action.export** | Export | Xuất | |
| **COPY-action.cancel** | Cancel | Huỷ | |
| **COPY-action.share** | Share | Chia sẻ | |
| **COPY-action.zoom_in** | Zoom in | Phóng to | Timeline |
| **COPY-action.zoom_out** | Zoom out | Thu nhỏ | Timeline |
| **COPY-action.zoom_fit** | Fit timeline | Xem toàn bộ | |
| **COPY-action.snapping** | Snapping | Hít cạnh | Toggle |
| **COPY-action.unmute_all** | Unmute original sound | Bật lại tiếng gốc | |
| **COPY-action.shortcuts** | Keyboard shortcuts | Phím tắt | Opens CMP-ShortcutHelp |
| **COPY-action.music** | Music | Nhạc | Opens CMP-MusicPicker |
| **COPY-action.time_earlier** | Earlier | Sớm hơn | Moves a text layer or audio clip in time |
| **COPY-action.time_later** | Later | Muộn hơn | |
| **COPY-action.use_target** | Use {size} MB | Dùng {size} MB | Smallest reachable size target |

## Empty state, drop, time
| ID | en-US | vi-VN | Notes |
|---|---|---|---|
| **COPY-empty.title** | Add videos, photos or music to start. They stay on your device. | Thêm video, ảnh hoặc nhạc để bắt đầu. Tất cả vẫn nằm trên máy bạn. | |
| **COPY-drop.hint** | Drop to add | Thả để thêm | |
| **COPY-time.position** | {current} / {length} | {current} / {length} | Times as m:ss (h:mm:ss never needed, RULE-03); in the transport the current time adds the frame number as a separate muted suffix (e.g. 0:04 ·12) |

## Inspector
| ID | en-US | vi-VN | Notes |
|---|---|---|---|
| **COPY-inspector.frame** | Frame | Khung hình | |
| **COPY-inspector.placement** | Position | Vị trí | |
| **COPY-inspector.adjust** | Adjust | Chỉnh màu | |
| **COPY-inspector.speed** | Speed | Tốc độ | |
| **COPY-inspector.sound** | Sound | Âm thanh | |
| **COPY-inspector.fades** | Fades | Hiệu ứng mờ | |
| **COPY-inspector.text** | Text | Chữ | |
| **COPY-frame.aspect** | Aspect | Tỉ lệ | |
| **COPY-frame.rate** | Frame rate | Tốc độ khung hình | |
| **COPY-frame.background** | Background | Nền | |
| **COPY-placement.fit** | Fit | Vừa khung | |
| **COPY-placement.fill** | Fill | Lấp đầy | |
| **COPY-frame.original** | Original | Gốc | Aspect |
| **COPY-frame.blur** | Blur | Làm mờ | Background |
| **COPY-text.typeface** | Font | Phông chữ | |
| **COPY-text.sans** | Sans | Không chân | |
| **COPY-text.display** | Display | Tiêu đề | |
| **COPY-text.serif** | Serif | Có chân | |
| **COPY-text.rounded** | Rounded | Bo tròn | |
| **COPY-text.size** | Size | Cỡ chữ | |
| **COPY-text.colour** | Colour | Màu | |
| **COPY-text.style** | Style | Kiểu | |
| **COPY-text.plain** | Plain | Thường | |
| **COPY-text.outline** | Outline | Viền | |
| **COPY-text.shadow** | Shadow | Đổ bóng | |
| **COPY-text.box** | Box | Nền chữ | |
| **COPY-text.align** | Alignment | Căn lề | |

## Adjustments
| ID | en-US | vi-VN | Notes |
|---|---|---|---|
| **COPY-adjust.brightness** | Brightness | Độ sáng | |
| **COPY-adjust.contrast** | Contrast | Tương phản | |
| **COPY-adjust.highlights** | Highlights | Vùng sáng | |
| **COPY-adjust.shadows** | Shadows | Vùng tối | |
| **COPY-adjust.saturation** | Saturation | Độ bão hoà | |
| **COPY-adjust.vibrance** | Vibrance | Độ tươi | |
| **COPY-adjust.temperature** | Temperature | Nhiệt độ màu | |
| **COPY-adjust.tint** | Tint | Sắc thái | |
| **COPY-adjust.sharpen** | Sharpen | Làm nét | |
| **COPY-adjust.vignette** | Vignette | Tối góc | |
| **COPY-adjust.grain** | Grain | Hạt nhiễu | |
| **COPY-adjust.fade** | Fade | Phai | Lifted blacks |

## Looks
| ID | en-US | vi-VN | Notes |
|---|---|---|---|
| **COPY-looks.title** | Looks | Bộ lọc | Short: fits 320 px tabs |
| **COPY-looks.none** | None | Không | |
| **COPY-looks.intensity** | Intensity | Cường độ | |
| **COPY-looks.group_natural** | Natural | Tự nhiên | |
| **COPY-looks.group_film** | Film | Phim | |
| **COPY-looks.group_cinematic** | Cinematic | Điện ảnh | |
| **COPY-looks.group_bw** | Black & White | Đen trắng | |

## Music
| ID | en-US | vi-VN | Notes |
|---|---|---|---|
| **COPY-music.title** | Music | Nhạc | |
| **COPY-music.preview** | Play preview | Nghe thử | |
| **COPY-music.add** | Add at playhead | Thêm tại vị trí phát | |

## Export
| ID | en-US | vi-VN | Notes |
|---|---|---|---|
| **COPY-export.title** | Export | Xuất | |
| **COPY-export.kind_video** | Video | Video | |
| **COPY-export.kind_gif** | GIF | GIF | |
| **COPY-export.kind_audio** | Audio only | Chỉ âm thanh | |
| **COPY-export.resolution** | Resolution | Độ phân giải | |
| **COPY-export.quality** | Quality | Chất lượng | |
| **COPY-export.size_target** | Under {size} MB | Dưới {size} MB | |
| **COPY-export.q_smaller** | Smaller file | Tệp nhỏ hơn | |
| **COPY-export.q_balanced** | Balanced | Cân bằng | |
| **COPY-export.q_best** | Best | Tốt nhất | |
| **COPY-export.estimate** | About {size} MB | Khoảng {size} MB | |
| **COPY-export.target_lower_res** | {size} MB is too small for {res}. {fit} can make it. | {size} MB quá nhỏ cho {res}. Có thể đạt ở {fit}. | |
| **COPY-export.target_unreachable** | {size} MB is too small for this video. The smallest possible is {min} MB. | {size} MB quá nhỏ cho video này. Nhỏ nhất có thể là {min} MB. | |
| **COPY-export.gif_range** | Range (up to 15 s) | Đoạn (tối đa 15 giây) | |
| **COPY-export.gif_size** | Size | Kích thước | |
| **COPY-export.gif_rate** | Frames per second | Khung hình/giây | |
| **COPY-export.format_note** | Saves as {format}. This browser can't make {preferred}. | Lưu dạng {format}. Trình duyệt này không tạo được {preferred}. | |
| **COPY-export.progress** | Exporting… {percent} % · about {remaining} left | Đang xuất… {percent} % · còn khoảng {remaining} | |
| **COPY-export.done** | Saved {name} | Đã lưu {name} | |

## Notices, reasons, errors, confirmations
| ID | en-US | vi-VN | Notes |
|---|---|---|---|
| **COPY-notice.length_limited** | Shortened to keep the project within 10 minutes. | Đã rút ngắn để dự án không quá 10 phút. | |
| **COPY-notice.length_full** | That would make the project longer than 10 minutes. | Thao tác này sẽ khiến dự án dài quá 10 phút. | |
| **COPY-notice.needs_clip** | Add a video or photo to export. | Hãy thêm video hoặc ảnh để xuất. | |
| **COPY-notice.no_sound** | one: {name} was added without sound. This browser can't play its audio. · other: {name} were added without sound. This browser can't play their audio. | Đã thêm {name} nhưng không có tiếng. Trình duyệt này không phát được âm thanh của tệp. | |
| **COPY-notice.split_too_close** | Move the playhead further from the clip's edge to split. | Hãy dời vị trí phát xa mép clip hơn để tách. | |
| **COPY-notice.text_limit** | You've reached 50 text layers. | Đã đạt tối đa 50 lớp chữ. | |
| **COPY-notice.no_audio_room** | No free room on the audio track here. | Không còn chỗ trống trên rãnh âm thanh tại đây. | |
| **COPY-notice.speed_limited** | Speed stopped here so the clip stays at least 0.1 s long. | Tốc độ dừng ở đây để clip dài ít nhất 0,1 giây. | |
| **COPY-notice.crossfade_too_short** | These clips are too short for a cross-fade. | Các clip này quá ngắn để chuyển mờ. | |
| **COPY-notice.no_sound_to_export** | This project has no sound to export. | Dự án không có âm thanh để xuất. | |
| **COPY-notice.slow_device** | This device may play the preview unevenly. Exports are not affected. | Thiết bị này có thể phát xem trước không mượt. Tệp xuất không bị ảnh hưởng. | |
| **COPY-error.refused_list** | Couldn't add: {list} | Không thêm được: {list} | List of "name: reason" |
| **COPY-reason.unsupported** | not a supported video, photo or audio file | không phải tệp video, ảnh hoặc âm thanh được hỗ trợ | |
| **COPY-reason.too_large** | larger than 4 GB | lớn hơn 4 GB | |
| **COPY-reason.too_long** | longer than 3 hours | dài hơn 3 giờ | |
| **COPY-reason.too_big_picture** | picture larger than 5120 × 2880 | hình lớn hơn 5120 × 2880 | |
| **COPY-reason.too_short** | too short | quá ngắn | |
| **COPY-reason.too_many** | the project already has 100 files | dự án đã có 100 tệp | |
| **COPY-reason.protected** | copy-protected | được bảo vệ chống sao chép | |
| **COPY-reason.no_media** | has no usable picture or sound | không có hình hoặc âm thanh dùng được | |
| **COPY-reason.codec** | this browser can't decode it | trình duyệt này không giải mã được | |
| **COPY-reason.folder** | folders can't be added | không thể thêm thư mục | |
| **COPY-error.export_failed** | Your edits are safe. Try a lower resolution. | Chỉnh sửa của bạn vẫn còn. Hãy thử độ phân giải thấp hơn. | |
| **COPY-error.export_interrupted** | Export stopped because the page was hidden. Your edits are safe. Keep this page open and try again. | Xuất bị dừng vì trang bị ẩn. Chỉnh sửa của bạn vẫn còn. Hãy giữ trang mở và thử lại. | |
| **COPY-error.no_space** | Not enough free space on this device for this export. | Không đủ dung lượng trống trên máy để xuất. | |
| **COPY-confirm.new_project** | Start a new project? Unexported changes will be lost. | Bắt đầu dự án mới? Các thay đổi chưa xuất sẽ bị mất. | |
| **COPY-help.title** | Keyboard shortcuts | Phím tắt | |

## Privacy and support
| ID | en-US | vi-VN | Notes |
|---|---|---|---|
| **COPY-privacy.badge** | Your media never leaves this device | Tệp của bạn không bao giờ rời khỏi máy này | |
| **COPY-privacy.details** | Clip Maker edits and exports entirely in your browser. Nothing is uploaded and your project isn't kept after you close the page. The first visit downloads the tool's looks, fonts and music (about 12 MB) so it works offline. During an export it may use temporary space on your device. That space is deleted when the export ends, or the next time you open Clip Maker if the page closed during an export. | Clip Maker chỉnh sửa và xuất hoàn toàn trong trình duyệt. Không có gì được tải lên và không có gì được giữ lại sau khi bạn đóng trang. Lần đầu mở, công cụ tải sẵn bộ lọc màu, phông chữ và nhạc (khoảng 12 MB) để dùng ngoại tuyến. Khi xuất, công cụ có thể dùng tạm dung lượng trên máy; phần này sẽ bị xoá khi quá trình xuất kết thúc, hoặc khi bạn mở lại Clip Maker nếu trang bị đóng giữa chừng. | |
| **COPY-privacy.source_label** | Source code on GitHub | Mã nguồn trên GitHub | |
| **COPY-privacy.notices** | Licences and credits | Giấy phép và ghi công | |
| **COPY-unsupported.title** | This browser can't edit video | Trình duyệt này không chỉnh sửa video được | |
| **COPY-unsupported.missing_decode** | playing video | phát video | Item in {missing} |
| **COPY-unsupported.missing_encode** | creating video files | tạo tệp video | |
| **COPY-unsupported.missing_effects** | drawing effects | vẽ hiệu ứng | |
| **COPY-privacy.notices_title** | Licences and credits | Giấy phép và ghi công | Heading of the in-tool notices view |
| **COPY-unsupported.body** | Missing: {missing}. Open Clip Maker in an up-to-date desktop or phone browser. | Thiếu: {missing}. Hãy mở Clip Maker bằng trình duyệt mới trên máy tính hoặc điện thoại. | |

## Actions (more)
| ID | en-US | vi-VN | Notes |
|---|---|---|---|
| **COPY-action.back** | Back | Quay lại | |
| **COPY-action.change_settings** | Change settings | Đổi cài đặt | |
| **COPY-action.close** | Close | Đóng | |
| **COPY-action.dismiss** | Dismiss | Bỏ qua | |
| **COPY-action.done** | Done | Xong | |
| **COPY-action.full_screen** | Full screen | Toàn màn hình | |
| **COPY-action.exit_full_screen** | Exit full screen | Thoát toàn màn hình | |
| **COPY-action.more** | More | Thêm | |
| **COPY-action.mute** | Mute | Tắt tiếng | |
| **COPY-action.play** | Play | Phát | |
| **COPY-action.pause** | Pause | Tạm dừng | |
| **COPY-action.prev_frame** | Previous frame | Khung trước | |
| **COPY-action.next_frame** | Next frame | Khung sau | |
| **COPY-action.remove_crossfade** | Remove cross-fade | Bỏ chuyển mờ | |
| **COPY-action.try_again** | Try again | Thử lại | |
| **COPY-action.use_res** | Use {res} | Dùng {res} | |

## Regions and labels
| ID | en-US | vi-VN | Notes |
|---|---|---|---|
| **COPY-toolbar.label** | Editor | Trình chỉnh sửa | |
| **COPY-inspector.label** | Clip | Clip | |
| **COPY-inspector.edit** | Edit | Chỉnh sửa | |
| **COPY-inspector.resize** | Resize inspector | Đổi cỡ bảng thuộc tính | |
| **COPY-timeline.label** | Timeline | Dòng thời gian | |
| **COPY-preview.label** | Preview at {time} | Xem trước tại {time} | |
| **COPY-preview.comparing** | Showing original | Đang xem bản gốc | |
| **COPY-status.facts** | {aspect} · {rate} fps · {length} | {aspect} · {rate} fps · {length} | |

## Timeline
| ID | en-US | vi-VN | Notes |
|---|---|---|---|
| **COPY-timeline.length** | Length {length} | Độ dài {length} | |
| **COPY-timeline.project_end** | End | Cuối dự án | |
| **COPY-timeline.main_track** | Main track | Rãnh chính | Names the group of clips (screen readers) |
| **COPY-timeline.zoom_frames** | 1 frame = {px} px | 1 khung = {px} px | |
| **COPY-crossfade.length** | Cross-fade length | Độ dài chuyển mờ | |
| **COPY-crossfade.shorter** | Shorter | Ngắn hơn | |
| **COPY-crossfade.longer** | Longer | Dài hơn | |

## Media panel and adding
| ID | en-US | vi-VN | Notes |
|---|---|---|---|
| **COPY-media.title** | Media | Tệp đã thêm | |
| **COPY-media.place_again** | Add to timeline | Thêm vào dòng thời gian | |
| **COPY-media.checking** | Checking {name}… | Đang kiểm tra {name}… | |
| **COPY-media.queue** | {n} of {total} | {n}/{total} | |
| **COPY-media.refused** | Not added | Chưa thêm được | |
| **COPY-media.empty** | No media yet. Videos, photos and audio you add are listed here. | Chưa có tệp nào. Video, ảnh và âm thanh bạn thêm sẽ hiện ở đây. | |
| **COPY-media.kind_video** | Video | Video | |
| **COPY-media.kind_photo** | Photo | Ảnh | |
| **COPY-media.kind_audio** | Audio | Âm thanh | |
| **COPY-empty.drop_hint** | Or drop or paste files here | Hoặc thả hay dán tệp vào đây | |
| **COPY-drop.kinds** | Videos, photos and audio | Video, ảnh và âm thanh | |
| **COPY-notice.added** | one: Added {count} file · other: Added {count} files | Đã thêm {count} tệp | |
| **COPY-notice.adding** | Adding {done} of {total}… | Đang thêm {done}/{total}… | |
| **COPY-notice.adding_label** | Adding media | Đang thêm tệp | |
| **COPY-notice.checking** | Checking {done} of {total} files… | Đang kiểm tra {done}/{total} tệp… | |
| **COPY-notice.applied_all** | one: Applied to {count} clip · other: Applied to all {count} clips | Đã áp dụng cho cả {count} clip | |

## Inspector controls
| ID | en-US | vi-VN | Notes |
|---|---|---|---|
| **COPY-adjust.group_light** | Light | Ánh sáng | |
| **COPY-adjust.group_colour** | Colour | Màu sắc | |
| **COPY-adjust.group_effects** | Effects | Hiệu ứng | |
| **COPY-tab.audio** | Audio | Âm thanh | Phone tab: music and sound |
| **COPY-action.go_start** | Go to start | Về đầu | |
| **COPY-action.go_end** | Go to end | Về cuối | |
| **COPY-placement.mode** | Placement | Cách đặt | |
| **COPY-placement.scale** | Scale | Thu phóng | |
| **COPY-placement.offset** | Offset | Độ lệch | |
| **COPY-placement.offset_x** | Horizontal offset | Lệch ngang | |
| **COPY-placement.offset_y** | Vertical offset | Lệch dọc | |
| **COPY-placement.nudge_left** | Nudge left | Dịch trái | |
| **COPY-placement.nudge_right** | Nudge right | Dịch phải | |
| **COPY-placement.nudge_up** | Nudge up | Dịch lên | |
| **COPY-placement.nudge_down** | Nudge down | Dịch xuống | |
| **COPY-speed.exact** | Exact | Chính xác | |
| **COPY-speed.length** | Length {length} | Độ dài {length} | |
| **COPY-fades.in** | Fade in | Hiện dần | |
| **COPY-fades.out** | Fade out | Mờ dần | |
| **COPY-fades.quick_in** | Quick fade in | Hiện nhanh | |
| **COPY-fades.quick_out** | Quick fade out | Mờ nhanh | |
| **COPY-sound.volume** | Volume | Âm lượng | |
| **COPY-photo.duration** | Duration | Thời lượng | |

## Text layers
| ID | en-US | vi-VN | Notes |
|---|---|---|---|
| **COPY-text.field** | Text | Nội dung chữ | |
| **COPY-text.box_colour** | Box colour | Màu nền chữ | |
| **COPY-text.align_left** | Left | Trái | |
| **COPY-text.align_centre** | Centre | Giữa | |
| **COPY-text.align_right** | Right | Phải | |
| **COPY-text.fade** | Fade | Hiện mờ | |
| **COPY-text.position** | Position | Vị trí | |
| **COPY-text.position_x** | Horizontal position | Vị trí ngang | |
| **COPY-text.position_y** | Vertical position | Vị trí dọc | |
| **COPY-text.bring_forward** | Bring forward | Đưa lên trên | |
| **COPY-text.send_back** | Send back | Đưa xuống dưới | |
| **COPY-text.done** | Done | Xong | |
| **COPY-text.finish_hint** | Esc or Ctrl+Enter to finish | Esc hoặc Ctrl+Enter để xong | |
| **COPY-text.count** | {n} / 500 | {n} / 500 | |
| **COPY-text.char_limit** | Text is at its 500-character limit. | Chữ đã đạt giới hạn 500 ký tự. | |

## Colours (RULE-11 palette)
| ID | en-US | vi-VN | Notes |
|---|---|---|---|
| **COPY-colour.white** | White | Trắng | |
| **COPY-colour.black** | Black | Đen | |
| **COPY-colour.red** | Red | Đỏ | |
| **COPY-colour.orange** | Orange | Cam | |
| **COPY-colour.yellow** | Yellow | Vàng | |
| **COPY-colour.green** | Green | Xanh lá | |
| **COPY-colour.cyan** | Cyan | Xanh lơ | |
| **COPY-colour.blue** | Blue | Xanh dương | |
| **COPY-colour.purple** | Purple | Tím | |
| **COPY-colour.pink** | Pink | Hồng | |

## Looks and music (more)
| ID | en-US | vi-VN | Notes |
|---|---|---|---|
| **COPY-looks.groups** | Look groups | Nhóm bộ lọc | |
| **COPY-looks.previewing** | Previewing {look} | Đang xem thử {look} | |
| **COPY-music.your_audio** | Your audio | Âm thanh của bạn | |
| **COPY-music.your_audio_hint** | Bundled tracks are free to use. Or add your own: | Nhạc có sẵn được dùng miễn phí. Hoặc thêm của bạn: | |
| **COPY-music.stop** | Stop preview | Dừng nghe thử | |

## Export (more)
| ID | en-US | vi-VN | Notes |
|---|---|---|---|
| **COPY-export.size_limit** | Size limit | Giới hạn dung lượng | |
| **COPY-export.size_custom** | Other | Khác | |
| **COPY-export.size_custom_label** | Size limit in MB | Giới hạn dung lượng (MB) | |
| **COPY-export.res_needs_source** | {res} needs a larger source video or photo | {res} cần video hoặc ảnh gốc lớn hơn | |
| **COPY-export.res_no_encoder** | This device can't create {res} | Thiết bị này không tạo được {res} | |
| **COPY-export.saves_as** | Saves as {format} | Lưu dạng {format} | |
| **COPY-export.gif_from** | From | Từ | |
| **COPY-export.gif_to** | To | Đến | |
| **COPY-export.audio_format** | Format | Định dạng | |
| **COPY-export.audio_compressed** | Compressed · {format} | Nén · {format} | |
| **COPY-export.audio_wav** | WAV · best quality | WAV · chất lượng cao nhất | |
| **COPY-export.cancelling** | Cancelling… | Đang huỷ… | |
| **COPY-export.progress_label** | Export progress | Tiến độ xuất | |
| **COPY-export.keep_open** | Keep this page open until the export finishes. | Hãy giữ trang này mở cho đến khi xuất xong. | |

## Licence notices
| ID | en-US | vi-VN | Notes |
|---|---|---|---|
| **COPY-notices.fonts** | Typefaces | Phông chữ | |
| **COPY-notices.code** | Code | Mã nguồn | |
| **COPY-notices.col_title** | Title | Tên | |
| **COPY-notices.col_source** | Source | Nguồn | |
| **COPY-notices.col_licence** | Licence | Giấy phép | |

## Shortcut help
| ID | en-US | vi-VN | Notes |
|---|---|---|---|
| **COPY-help.group_playback** | Playback | Phát | |
| **COPY-help.group_edit** | Edit | Chỉnh sửa | |
| **COPY-help.group_history** | History | Lịch sử | |
| **COPY-help.group_view** | View | Hiển thị | |
| **COPY-help.group_files** | Files | Tệp | |
| **COPY-help.group_help** | Help | Trợ giúp | |
| **COPY-help.play_pause** | Play or pause | Phát hoặc tạm dừng | |
| **COPY-help.frame_step** | One frame back / forward (Shift: 1 s) | Lùi / tiến một khung hình (Shift: 1 giây) | |
| **COPY-help.go_ends** | Go to start / end | Về đầu / cuối | |
| **COPY-help.move** | Move earlier / later (text and audio: 1 frame, Shift: 1 s) | Dời lên trước / ra sau (chữ và âm thanh: 1 khung hình, Shift: 1 giây) | |
| **COPY-help.mute** | Mute or unmute clip | Tắt/bật tiếng clip | |
| **COPY-help.paste** | Paste colour, or add copied files | Dán màu, hoặc thêm tệp đã sao chép | |
| **COPY-help.hold** | Hold | Giữ | |
| **COPY-help.zoom** | Zoom timeline in / out | Phóng to / thu nhỏ dòng thời gian | |
| **COPY-help.snapping** | Snapping on or off | Bật/tắt hít cạnh | |
| **COPY-help.esc** | Close a dialog or menu | Đóng hộp thoại hoặc menu | |
| **COPY-help.finish_editing** | Finish editing text | Xong sửa chữ | |
| **COPY-help.scope** | Shortcuts work while you are not typing. Sliders use the arrow keys, and buttons use Space and Enter, while they have focus. | Phím tắt hoạt động khi bạn không gõ chữ. Thanh trượt dùng phím mũi tên, nút dùng Space và Enter khi đang được chọn. | |

## Look names (looks.md)
| ID | en-US | vi-VN | Notes |
|---|---|---|---|
| **COPY-look.natural_fresh** | Fresh | Tươi | |
| **COPY-look.natural_warm** | Warm | Ấm | |
| **COPY-look.natural_cool** | Cool | Mát | |
| **COPY-look.natural_vivid** | Vivid | Rực rỡ | |
| **COPY-look.film_faded** | Faded | Phai màu | |
| **COPY-look.film_retro** | Retro | Cổ điển | |
| **COPY-look.film_pastel** | Pastel | Pastel | |
| **COPY-look.film_instant** | Instant | Ảnh lấy liền | |
| **COPY-look.cine_teal_orange** | Teal & Orange | Xanh cam | |
| **COPY-look.cine_moody** | Moody | Trầm | |
| **COPY-look.cine_night** | Night | Đêm | |
| **COPY-look.cine_golden** | Golden | Hoàng kim | |
| **COPY-look.bw_classic** | Classic | Kinh điển | |
| **COPY-look.bw_high** | Contrast | Tương phản | |
| **COPY-look.bw_soft** | Soft | Dịu | |
| **COPY-look.bw_sepia** | Sepia | Nâu cổ | |
| **COPY-notice.more** | +{n} more | +{n} thông báo khác | Collapsed notices chip |
| **COPY-action.show_all** | Show all | Xem tất cả | |
| **COPY-export.failed_title** | Export failed | Xuất thất bại | |
| **COPY-export.interrupted_title** | Export stopped | Đã dừng xuất | |
| **COPY-export.no_space_title** | Not enough space | Không đủ dung lượng | |
| **COPY-timeline.ends_at** | ends {time} | kết thúc {time} | Trim readout |
