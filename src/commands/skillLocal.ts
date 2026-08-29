import { Command } from "commander";
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import kleur from "kleur";
import { writeScaffoldedSkill, mindSkillPath } from "../lib/skillScaffold.js";
import { buildServedSkillPayload, parseSkillForTrust } from "../lib/skillPayload.js";
import {
  applyReviewToFile,
  ciBlocksMerge,
  hashBody,
  readSkillParts,
  type ReviewState,
} from "../lib/skillReview.js";
import { SCANNER_VERSION } from "../lib/skillTrust.js";
import { appendRun } from "../lib/confidenceHistory.js";

const MIND = ".mind";

function readFile(p: string): string {
  return readFileSync(p, "utf8");
}

function writeFile(p: string, content: string): void {
  writeFileSync(p, content, "utf8");
}

export function ensureTaskBudgets(cwd: string): void {
  const dir = join(cwd, ".modelbound");
  const cfg = join(dir, "task-budgets.json");
  if (existsSync(cfg)) return;
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    cfg,
    `${JSON.stringify({ files: { max: 5 }, loc: { max: 250 }, features: { max: 1 } }, null, 2)}\n`,
    "utf8",
  );
}

export function registerSkillLocal(program: Command): void {
  const newCmd = program.command("new").description("Scaffold new .mind/ artifacts");

  newCmd
    .command("skill <name>")
    .description("Create a new .mind/skills/ file with default scope constraints")
    .requiredOption("-d, --description <text>", "skill description / trigger")
    .option("-o, --out <path>", "output path under repo root")
    .option("--no-scope", "omit scope-constraint block")
    .action((name: string, opts: { description: string; out?: string; scope: boolean }) => {
      const cwd = process.cwd();
      ensureTaskBudgets(cwd);
      const rel = opts.out ?? mindSkillPath(name);
      const abs = resolve(cwd, rel);
      if (existsSync(abs)) {
        console.error(kleur.red(`Skill already exists: ${rel}`));
        process.exit(1);
      }
      writeScaffoldedSkill(
        cwd,
        { name, description: opts.description, includeScope: opts.scope !== false },
        rel,
      );
      console.log(kleur.green(`Created ${rel}`));
    });

  program
    .command("skill-trust <path>")
    .description("Score a skill file with trust heuristics (scanner h5)")
    .action((filePath: string) => {
      const cwd = process.cwd();
      const raw = readFile(resolve(cwd, filePath));
      const trust = parseSkillForTrust(raw, filePath);
      appendRun(cwd, filePath, {
        ts: new Date().toISOString(),
        trust: trust.total,
        tests_passed: 0,
        tests_total: 0,
        scanner_version: SCANNER_VERSION,
      });
      const payload = buildServedSkillPayload(cwd, filePath, raw);
      console.log(`trust_score: ${payload.trust_score} (${payload.scanner_version})`);
      console.log(`review_state: ${payload.review_state}`);
      if (payload.confidence.latest_trust != null) {
        const arrow =
          payload.confidence.trend === "up" ? "↑" : payload.confidence.trend === "down" ? "↓" : "→";
        console.log(
          `confidence: pass_rate=${payload.confidence.pass_rate ?? "n/a"}% trust=${payload.confidence.latest_trust} ${arrow}`,
        );
      }
      for (const f of trust.findings) {
        console.log(`• [${f.severity}] ${f.message}`);
        if (f.hint) console.log(kleur.gray(`  hint: ${f.hint}`));
      }
    });

  program
    .command("status [path]")
    .description("Show trust score, review state, and confidence trend")
    .action((filePath?: string) => {
      const cwd = process.cwd();
      if (filePath) {
        const raw = readFile(resolve(cwd, filePath));
        printStatusLine(filePath, buildServedSkillPayload(cwd, filePath, raw));
        return;
      }
      const skillsDir = join(cwd, MIND, "skills");
      if (!existsSync(skillsDir)) {
        console.error(kleur.red(`${skillsDir} not found.`));
        process.exit(1);
      }
      for (const entry of readdirSync(skillsDir)) {
        if (!entry.endsWith(".md")) continue;
        const rel = join(".mind", "skills", entry);
        const raw = readFile(resolve(cwd, rel));
        printStatusLine(rel, buildServedSkillPayload(cwd, rel, raw));
      }
    });

  const review = program.command("review").description("Skill review lifecycle");

  review
    .command("request <path>")
    .description("Mark skill pending_review")
    .action((filePath: string) => {
      const abs = resolve(process.cwd(), filePath);
      const next = applyReviewToFile(readFile(abs), { state: "pending_review" });
      writeFile(abs, next);
      console.log(kleur.green(`✓ pending_review ${filePath}`));
    });

  review
    .command("approve <path>")
    .description("Approve skill (stores body hash + trust score)")
    .option("--by <name>", "reviewer id")
    .option("--notes <text>", "review notes")
    .action((filePath: string, opts: { by?: string; notes?: string }) => {
      const cwd = process.cwd();
      const abs = resolve(cwd, filePath);
      const raw = readFile(abs);
      const parts = readSkillParts(raw);
      const trust = parseSkillForTrust(raw, filePath);
      const next = applyReviewToFile(raw, {
        state: "approved",
        reviewed_by: opts.by ?? process.env.USER ?? "local",
        reviewed_at: new Date().toISOString(),
        approved_hash: hashBody(parts.body),
        approved_trust: trust.total,
        scanner_version: SCANNER_VERSION,
        notes: opts.notes,
      });
      writeFile(abs, next);
      console.log(kleur.green(`✓ approved ${filePath} (trust ${trust.total})`));
    });

  review
    .command("reject <path>")
    .description("Reject skill")
    .option("--by <name>", "reviewer id")
    .option("--notes <text>", "review notes")
    .action((filePath: string, opts: { by?: string; notes?: string }) => {
      const abs = resolve(process.cwd(), filePath);
      const next = applyReviewToFile(readFile(abs), {
        state: "rejected",
        reviewed_by: opts.by ?? process.env.USER ?? "local",
        reviewed_at: new Date().toISOString(),
        notes: opts.notes,
      });
      writeFile(abs, next);
      console.log(kleur.green(`✓ rejected ${filePath}`));
    });

  review
    .command("status <path>")
    .description("Show review_state, review_meta, trust, confidence")
    .option("--diff", "show trust delta vs approval snapshot")
    .action((filePath: string, opts: { diff?: boolean }) => {
      const cwd = process.cwd();
      const raw = readFile(resolve(cwd, filePath));
      const payload = buildServedSkillPayload(cwd, filePath, raw);
      if (opts.diff && payload.review_meta?.approved_trust != null) {
        const delta = payload.trust_score - payload.review_meta.approved_trust;
        const arrow = delta > 0 ? "↑" : delta < 0 ? "↓" : "→";
        console.log(
          `trust: ${payload.review_meta.approved_trust} → ${payload.trust_score} (${arrow}${Math.abs(delta)})`,
        );
        if (payload.review_state === "draft" && payload.review_meta.approved_hash) {
          console.log(kleur.yellow("Body modified since approval — effective state is draft."));
        }
      }
      console.log(JSON.stringify(payload, null, 2));
    });

  review
    .command("gate <path>")
    .description("CI gate — exit 1 if skill is not approved")
    .action((filePath: string) => {
      const cwd = process.cwd();
      const raw = readFile(resolve(cwd, filePath));
      const payload = buildServedSkillPayload(cwd, filePath, raw);
      if (ciBlocksMerge(payload.review_state as ReviewState)) {
        console.error(kleur.red(`✖ review gate failed: ${payload.review_state}`));
        process.exit(1);
      }
      console.log(kleur.green(`✓ approved skill ${filePath}`));
    });
}

function printStatusLine(
  filePath: string,
  payload: ReturnType<typeof buildServedSkillPayload>,
): void {
  const arrow =
    payload.confidence.trend === "up" ? "↑" : payload.confidence.trend === "down" ? "↓" : "→";
  console.log(
    `${filePath}: trust=${payload.trust_score} review=${payload.review_state} pass_rate=${payload.confidence.pass_rate ?? "n/a"}% ${arrow}`,
  );
}
