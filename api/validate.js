import {allowMethod, readJson, reply} from "../server/http.js";
import {validateProject} from "../server/services/validate-project.js";
export default async function handler(req, res) {
  if (!allowMethod(req, res, "POST")) return;
  try {
    const result = validateProject(await readJson(req));
    return reply(res, result.status, result.body);
  } catch (error) {
    const expected = [400, 413, 415].includes(error.status);
    return reply(res, expected ? error.status : 500, {error:expected ? error.message : "INTERNAL_ERROR"});
  }
}
