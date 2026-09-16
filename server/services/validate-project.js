import {z} from "zod";
import {rates} from "../../src/timecode.js";
import {reviewProject} from "../../src/domain/review.js";

const text = z.string().max(2000);
const optionalText = text.default("");
const numeric = z.union([z.number().finite(), text]);
const credit = z.object({
  role: z.enum(["Composer", "Publisher"]), last: optionalText, name: optionalText,
  pro: optionalText, share: numeric.default(""),
});
const credits = z.array(credit).max(100);
const project = z.object({
  production: z.object({
    title: optionalText, company: optionalText, preparedBy: optionalText, email: optionalText,
    duration: optionalText, startTimecode: optionalText,
    rate: z.enum(Object.keys(rates)).default("24"),
  }),
  mode: z.enum(["movie", "offset", "manual"]),
  movieOffset: optionalText,
  movieMetadata: z.object({title: optionalText, duration: z.number().finite().positive()}).optional(),
  movieOverrides: z.object({duration: text.optional(), trimStart: numeric.optional(), trimEnd: numeric.optional()}).optional(),
  sharedCueDetails: z.object({credits}),
  tracks: z.array(z.object({id: text.min(1), title: optionalText, offset: optionalText})).max(500),
  cues: z.array(z.object({
    trackId: text.min(1), title: optionalText, start: optionalText, end: optionalText,
    usage: optionalText, method: z.enum(["movie", "offset", "manual"]),
    reviewed: z.boolean().optional(), staleSource: z.boolean().optional(),
    credits: credits.optional(),
  })).max(2000),
}).superRefine((value, context) => {
  const ids = value.tracks.map(t => t.id);
  if (new Set(ids).size !== ids.length) context.addIssue({code:"custom", path:["tracks"], message:"Track IDs must be unique"});
});

// Framework-independent service. Invalid shapes are distinct from incomplete sheets.
export function validateProject(input) {
  const parsed = project.safeParse(input);
  if (!parsed.success) return {status:400, body:{error:"INVALID_PROJECT", fields:parsed.error.issues.map(i=>({path:i.path.join("."), message:i.message}))}};
  return {status:200, body:reviewProject(parsed.data)};
}
