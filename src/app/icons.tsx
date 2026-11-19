// MOD-App — inlined lucide-static icons (DEP-11, ADR-0002 §3). Copied from the sibling image-annotator.
// Only the icons imported here are bundled. Each SVG string is turned into elements once — never
// injected as HTML (ADR-0002 bans innerHTML) — and drawn with the stroke width of the designs.
import type { JSX } from 'preact';
import {
  ArrowDown,
  ArrowDownToLine,
  ArrowLeft,
  ArrowLeftToLine,
  ArrowRight,
  ArrowRightToLine,
  ArrowUp,
  ArrowUpToLine,
  AudioLines,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleX,
  Clipboard,
  Code,
  Contrast,
  Copy,
  Download,
  EllipsisVertical,
  ExternalLink,
  Eye,
  EyeOff,
  FilePlus2,
  Film,
  FlipHorizontal2,
  FlipVertical2,
  GripVertical,
  HardDrive,
  Image,
  Info,
  Keyboard,
  Layers,
  LoaderCircle,
  Magnet,
  Maximize,
  Minimize,
  Minus,
  MonitorX,
  Music,
  Pause,
  Pipette,
  Play,
  Plus,
  Redo2,
  RotateCcw,
  RotateCw,
  Scissors,
  Share2,
  ShieldCheck,
  SkipBack,
  SkipForward,
  TextAlignCenter,
  TextAlignEnd,
  TextAlignStart,
  SlidersVertical,
  Square,
  Trash2,
  TriangleAlert,
  Type,
  Undo2,
  Upload,
  Video,
  Volume2,
  VolumeX,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-static';

const SOURCES = {
  // CMP-Toolbar
  addMedia: Plus,
  music: Music,
  text: Type,
  undo: Undo2,
  redo: Redo2,
  shortcuts: Keyboard,
  newProject: FilePlus2,
  export: Download,
  more: EllipsisVertical,
  // CMP-EmptyState
  video: Video,
  photo: Image,
  // CMP-StatusBar
  shield: ShieldCheck,
  external: ExternalLink,
  code: Code,
  close: X,
  back: ArrowLeft,
  // SCR-Unsupported and CMP-Notice (F-023)
  monitorX: MonitorX,
  info: Info,
  // CMP-MediaPanel, CMP-DropOverlay and the CMP-Notice recipes (F-001)
  film: Film,
  trash: Trash2,
  loader: LoaderCircle,
  error: CircleX,
  success: CircleCheck,
  warning: TriangleAlert,
  upload: Upload,
  muted: VolumeX,
  // CMP-Preview transport and full-screen bar (F-002)
  goStart: SkipBack,
  prevFrame: ChevronLeft,
  play: Play,
  pause: Pause,
  nextFrame: ChevronRight,
  goEnd: SkipForward,
  fullScreen: Maximize,
  exitFullScreen: Minimize,
  moveEarlier: ArrowLeft,
  moveLater: ArrowRight,
  duplicate: Copy,
  edit: Scissors,
  // F-011: the music picker, the audio lane and the sound section
  stop: Square,
  audio: AudioLines,
  volume: Volume2,
  // F-004: Split, Start here and End here (boards CMP-Timeline, SCR-Editor selected narrow)
  split: Scissors,
  setIn: ArrowLeftToLine,
  setOut: ArrowRightToLine,
  // F-006: the Position section's nudges, Rotate, the flips and Reset; the compact inspector's resize grip
  nudgeLeft: ArrowLeft,
  nudgeRight: ArrowRight,
  nudgeUp: ArrowUp,
  nudgeDown: ArrowDown,
  rotate: RotateCw,
  flipH: FlipHorizontal2,
  flipV: FlipVertical2,
  reset: RotateCcw,
  grip: GripVertical,
  // F-007: the Adjust tab (phone tab bar) and its footer (board CMP-Inspector "clip Adjust")
  adjust: SlidersVertical,
  compare: Eye,
  copyColour: Pipette,
  pasteColour: Clipboard,
  applyAll: Layers,
  // F-008: the Looks tab (phone tab bar) and CMP-LookGallery's chosen check
  looks: Contrast,
  check: Check,
  // F-009: the cross-fade bow-tie (style.md "Cross-fade marker": never an ×; our own shape, as the boards
  // draw it — CMP-Timeline's marker and the phone Cross-fade tile) and the popover's Shorter / Longer
  crossFade: '<svg viewBox="0 0 24 24"><path d="M4 6v12l8-6zM20 6v12l-8-6z"/></svg>',
  shorter: Minus,
  longer: Plus,
  // F-010: text alignment (CMP-Inspector "text layer"), Bring forward / Send back (board SCR-Editor editing-text
  // narrow, Text tab)
  alignLeft: TextAlignStart,
  alignCentre: TextAlignCenter,
  alignRight: TextAlignEnd,
  bringForward: ArrowUpToLine,
  sendBack: ArrowDownToLine,
  // F-013: the timeline's Snapping toggle and zoom controls (board CMP-Timeline: a magnet, the lenses, and Fit as
  // arrows out to a centre line, drawn as the board draws it)
  snapping: Magnet,
  zoomIn: ZoomIn,
  zoomOut: ZoomOut,
  zoomFit: '<svg viewBox="0 0 24 24"><path d="M3 12h6M15 12h6M6 9l-3 3 3 3M18 9l3 3-3 3M12 4v16"/></svg>',
  // CMP-ExportProgress (F-015): the failed, interrupted (page hidden) and no-space titles, and Share.
  failed: CircleAlert,
  pageHidden: EyeOff,
  storage: HardDrive,
  share: Share2,
} as const;

export type IconName = keyof typeof SOURCES;

type Shape = readonly [tag: string, attrs: Record<string, string>];

/** The child shapes of a lucide SVG string: simple self-closing elements with quoted attributes. */
function shapes(svg: string): Shape[] {
  const inner = svg.slice(svg.indexOf('>', svg.indexOf('<svg')) + 1, svg.lastIndexOf('</svg>'));
  return Array.from(inner.matchAll(/<([a-z]+)\s([^>]*?)\/>/g), (m) => {
    const attrs: Record<string, string> = {};
    for (const a of (m[2] ?? '').matchAll(/([\w-]+)="([^"]*)"/g)) attrs[a[1] ?? ''] = a[2] ?? '';
    return [m[1] ?? 'path', attrs] as const;
  });
}

const PARSED = Object.fromEntries(
  Object.entries(SOURCES).map(([name, svg]) => [name, shapes(svg)]),
) as unknown as Record<IconName, Shape[]>;

export function Icon({ name, size = 16, class: cls }: { name: IconName; size?: number; class?: string }) {
  return (
    <svg
      class={cls ? `tk-icon ${cls}` : 'tk-icon'}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PARSED[name].map(([Tag, attrs], i) => {
        const El = Tag as unknown as keyof JSX.IntrinsicElements;
        return <El key={i} {...(attrs as Record<string, string>)} />;
      })}
    </svg>
  );
}
