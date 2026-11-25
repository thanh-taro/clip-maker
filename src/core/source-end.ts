// MOD-Core — where a source ends. An audio clip always refers to a source (D-052: the tool ships no
// music), and a source's duration bounds how far any clip of it may extend (RULE-05, RULE-12).
import type { Project } from './project.gen';
import type { Micros } from './time';

/**
 * The end (duration) of a source, or undefined when unknown. Callers treat an unknown end as "the clip
 * may not grow", so no clip can ever extend past its source (RULE-05, RULE-12).
 */
export function sourceEnd(project: Project, sourceId: string): Micros | undefined {
  return project.sources.find((s) => s.id === sourceId)?.duration;
}
