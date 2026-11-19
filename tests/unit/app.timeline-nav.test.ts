// MOD-App timeline view settings (F-013): RULE-14 snapping (on by default, one toggle for the timeline and the
// preview) and the chosen zoom, both kept across New project (RULE-23) and never undo steps.
import { describe, expect, it } from 'vitest';
import { snapping, timelineNav, timelineZoom, toggleSnapping } from '../../src/app/timeline-nav';
import type { Project } from '../../src/core';
import { EMPTY_HISTORY, history, newProject, project } from '../../src/project';
import { photo, proj } from '../support/project';

function start(p: Project): void {
  project.value = p;
  history.value = EMPTY_HISTORY;
}
const steps = () => history.value.past.length;

describe('MOD-App timeline view settings', () => {
  it('RULE-14 F-013.R3 snapping is on by default and the toggle turns it off and on, with no undo step', () => {
    start(proj({ clips: [photo('A', 4)] }));
    expect(snapping.value).toBe(true);
    toggleSnapping();
    expect(snapping.value).toBe(false);
    toggleSnapping();
    expect(snapping.value).toBe(true);
    expect(steps()).toBe(0);
  });

  it('RULE-23 F-013 a new project keeps snapping and the timeline zoom', () => {
    start(proj({ clips: [photo('A', 4)] }));
    toggleSnapping();
    timelineZoom.value = 0.001;
    newProject();
    expect(project.value.clips).toEqual([]);
    expect(snapping.value).toBe(false);
    expect(timelineZoom.value).toBe(0.001);
    toggleSnapping();
    timelineZoom.value = null;
  });

  it('F-013 without a mounted timeline the zoom controls are unavailable', () => {
    expect(timelineNav.value).toEqual({ canZoomIn: false, canZoomOut: false, framePx: null, centred: false });
  });
});
