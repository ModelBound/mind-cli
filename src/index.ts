#!/usr/bin/env node
import { Command } from "commander";
import { mkdirSync, writeFileSync, existsSync, readdirSync, readFileSync, statSync, unlinkSync } from "node:fs";
import { join, relative } from "node:path";
import matter from "gray-matter";
import kleur from "kleur";

const program = new Command();
program.name("mind").description(".mind/ command-line tools").version("0.1.0");

const MIND = ".mind";

function ensureDir(p: string) {
  mkdirSync(p, { recursive: true });
}

program
  .command("init")
  .description("Scaffold a new .mind/ folder in the current directory")
  .option("-a, --agent <name>", "agent name", "assistant")
  .action((opts) => {
    if (existsSync(MIND)) {
      console.error(kleur.red(`${MIND}/ already exists.`));
      process.exit(1);
    }
    ensureDir(MIND);
    ensureDir(join(MIND, "memory"));
    ensureDir(join(MIND, "skills"));
    ensureDir(join(MIND, "context"));
    ensureDir(join(MIND, "diff"));

    writeFileSync(
      join(MIND, "INDEX.md"),
      `---\nversion: 0.1\nagent: ${opts.agent}\n---\n\n# Index\n\n## Always read first\n- [self.md](self.md)\n\n## Route by intent\n- ask: "help me" → [skills/](skills/)\n`,
    );
    writeFileSync(
      join(MIND, "self.md"),
      `---\ntype: system-prompt\ntrust: human-reviewed\n---\n\n# Self\n\nYou are the ${opts.agent}. Describe your role, tone, and constraints here.\n`,
    );
    console.log(kleur.green(`Created ${MIND}/`));
  });

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry.endsWith(".md")) out.push(full);
  }
  return out;
}

program
  .command("validate")
  .description("Check the .mind/ folder against the spec")
  .action(() => {
    if (!existsSync(MIND)) {
      console.error(kleur.red(`${MIND}/ not found.`));
      process.exit(1);
    }
    if (!existsSync(join(MIND, "INDEX.md"))) {
      console.error(kleur.red("Missing required INDEX.md"));
      process.exit(1);
    }
    let errors = 0;
    for (const file of walk(MIND)) {
      const raw = readFileSync(file, "utf8");
      try {
        const { data } = matter(raw);
        if (data.confidence !== undefined && (data.confidence < 0 || data.confidence > 1)) {
          console.log(kleur.yellow(`${relative(".", file)}: confidence out of range`));
          errors++;
        }
      } catch (e) {
        console.log(kleur.red(`${relative(".", file)}: ${(e as Error).message}`));
        errors++;
      }
    }
    if (errors) {
      console.error(kleur.red(`${errors} issue(s) found.`));
      process.exit(1);
    }
    console.log(kleur.green("OK"));
  });

program
  .command("gc")
  .description("Remove stale diff files (>30 days) and orphaned references")
  .option("--dry-run", "print actions without executing")
  .action((opts) => {
    const diffDir = join(MIND, "diff");
    if (!existsSync(diffDir)) return;
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    for (const f of readdirSync(diffDir)) {
      const full = join(diffDir, f);
      if (statSync(full).mtimeMs < cutoff) {
        console.log(kleur.gray(`${opts.dryRun ? "would remove" : "removing"} ${full}`));
        if (!opts.dryRun) unlinkSync(full);
      }
    }
  });

program
  .command("trust <path>")
  .description("Freeze a memory file as human-reviewed")
  .action((p: string) => {
    const raw = readFileSync(p, "utf8");
    const parsed = matter(raw);
    parsed.data.trust = "human-reviewed";
    parsed.data.confidence = 1.0;
    parsed.data.reviewed_at = new Date().toISOString().slice(0, 10);
    writeFileSync(p, matter.stringify(parsed.content, parsed.data));
    console.log(kleur.green(`Trusted ${p}`));
  });

program
  .command("diff <target>")
  .description("Scaffold a proposed-write file for a target path")
  .option("-r, --reason <text>", "reason for the change", "")
  .action((target: string, opts) => {
    ensureDir(join(MIND, "diff"));
    const date = new Date().toISOString().slice(0, 10);
    const seq = String(readdirSync(join(MIND, "diff")).filter((f) => f.startsWith(date)).length + 1).padStart(3, "0");
    const slug = target.replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
    const file = join(MIND, "diff", `${date}-${seq}-${slug}.md`);
    writeFileSync(
      file,
      `---\ntype: proposed-write\ntarget: ${target}\nconfidence: 0.7\nreason: ${opts.reason}\n---\n\n# Proposed change\n\nDescribe the change here.\n`,
    );
    console.log(kleur.green(`Created ${file}`));
  });

program
  .command("pack")
  .description("Bundle .mind/ into a single portable JSON file")
  .option("-o, --out <path>", "output file", ".mind.pack.json")
  .action((opts) => {
    if (!existsSync(MIND)) {
      console.error(kleur.red(`${MIND}/ not found.`));
      process.exit(1);
    }
    const files: Record<string, { frontmatter: Record<string, unknown>; body: string }> = {};
    for (const file of walk(MIND)) {
      const raw = readFileSync(file, "utf8");
      const { data, content } = matter(raw);
      files[relative(MIND, file)] = { frontmatter: data, body: content };
    }
    const pack = { version: "0.1", packed_at: new Date().toISOString(), files };
    writeFileSync(opts.out, JSON.stringify(pack, null, 2));
    console.log(kleur.green(`Packed ${Object.keys(files).length} file(s) → ${opts.out}`));
  });

program
  .command("review")
  .description("List pending diff/ proposals awaiting human review")
  .action(() => {
    const diffDir = join(MIND, "diff");
    if (!existsSync(diffDir)) {
      console.log(kleur.gray("No diff/ directory."));
      return;
    }
    const files = readdirSync(diffDir).filter((f) => f.endsWith(".md"));
    if (!files.length) {
      console.log(kleur.gray("No pending proposals."));
      return;
    }
    for (const f of files) {
      const raw = readFileSync(join(diffDir, f), "utf8");
      const { data } = matter(raw);
      console.log(kleur.cyan(f));
      console.log(`  target:     ${data.target ?? "?"}`);
      console.log(`  confidence: ${data.confidence ?? "?"}`);
      console.log(`  reason:     ${data.reason ?? ""}`);
    }
    console.log(kleur.gray(`\n${files.length} proposal(s). Approve by moving/merging into target file, then delete the diff.`));
  });

program
  .command("serve")
  .description("Start the mind-mcp server for this .mind/ folder")
  .action(() => {
    console.log(kleur.gray("Delegating to @modelbound/mind-mcp… (install it separately)"));
    console.log(kleur.cyan("  npx @modelbound/mind-mcp --root ."));
  });

program.parseAsync(process.argv);
