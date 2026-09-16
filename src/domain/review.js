import {cueIssues} from "../model.js";
import {effectiveProduction, productionIssues, productionWarnings} from "../project.js";

// Pure domain logic: shared by the editor and server, with no HTTP or storage.
export function reviewProject(state) {
  const issues = productionIssues(state), production = effectiveProduction(state);
  if (!state.cues.length) issues.push("Add at least one cue placement");
  const tracks = new Map(state.tracks.map(t => [t.id, t]));
  state.cues.forEach((cue, index) => {
    cueIssues(cue, tracks.get(cue.trackId), production, state.sharedCueDetails)
      .forEach(issue => issues.push(`Cue ${index + 1}: ${issue}`));
  });
  return {valid: issues.length === 0, issues, warnings: productionWarnings(state)};
}
