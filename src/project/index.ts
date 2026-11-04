// MOD-Project — immutable document, edit operations, history, unexported state
// (specs/40-technical/modules/MOD-Project.md, ADR-0011). Imports only MOD-Core (and signals).
// Phase 3.3 scaffold: the session's empty project and its signals; operations, history and the
// change epoch are built with F-001 … F-014 and F-018.
import { computed, signal } from '@preact/signals';
import { notImplemented, type Micros, type Project } from '../core';

/** The project of a new session: RULE-04 defaults (Original aspect, 30 fps, black background). */
export const EMPTY_PROJECT: Project = Object.freeze({
  frame: Object.freeze({ aspect: 'original', frameRate: 30, background: 'black' }),
  sources: Object.freeze([]),
  clips: Object.freeze([]),
  textLayers: Object.freeze([]),
  audioClips: Object.freeze([]),
}) as Project;

export const project = signal<Project>(EMPTY_PROJECT);
export const playhead = signal<Micros>(0);
export const selection = signal<readonly string[]>([]);

/** SCR-Editor "empty": no clips, text or audio. */
export const isEmpty = computed(
  () =>
    project.value.clips.length === 0 && project.value.textLayers.length === 0 && project.value.audioClips.length === 0,
);

export const undo = (): void => notImplemented('MOD-Project undo');
export const redo = (): void => notImplemented('MOD-Project redo');
export const newProject = (): void => notImplemented('MOD-Project newProject');
export const markExported = (_kind: 'video' | 'gif' | 'audio'): void => notImplemented('MOD-Project markExported');
