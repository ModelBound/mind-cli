import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { scoreSkillTrust, SCANNER_VERSION } from "./skillTrust.js";
import { buildScopeConstraintBlock } from "./scopeSnippet.js";
import { applyReviewToFile, readSkillParts, hashBody } from "./skillReview.js";

describe("SCANNER_VERSION", () => {
  it("is h5", () => {
    assert.equal(SCANNER_VERSION, "h5");
  });
});

describe("h5 slop findings", () => {
  it("penalizes missing task-scope limit", () => {
    const r = scoreSkillTrust({
      name: "x",
      description: "Triggered when user asks for help; does a bounded task.",
      body_md: "# Do work\n\nNo limits here.",
      allowed_tools: [],
    });
    assert.ok(r.findings.some((f) => f.message.includes("task-scope limit")));
    assert.ok(r.total <= 90);
  });

  it("passes with scope block", () => {
    const body = `# Skill\n\n${buildScopeConstraintBlock()}\n\nVerify with tests.`;
    const r = scoreSkillTrust({
      name: "x",
      description: "Triggered when user asks for help; does a bounded task.",
      body_md: body,
      allowed_tools: [],
    });
    assert.ok(!r.findings.some((f) => f.message.includes("task-scope limit")));
  });
});

describe("review state", () => {
  it("resets to draft when body changes after approval", () => {
    const initial = `---\nname: t\ndescription: Triggered when testing review; validates hash gate.\nreview:\n  state: draft\n---\n\n# Body v1\n\n${buildScopeConstraintBlock()}`;
    const parts1 = readSkillParts(initial);
    const approved = applyReviewToFile(initial, {
      state: "approved",
      approved_hash: hashBody(parts1.body),
      approved_trust: 90,
    });
    const edited = approved.replace("Body v1", "Body v2");
    const parts2 = readSkillParts(edited);
    assert.equal(parts2.review_state, "draft");
  });
});
