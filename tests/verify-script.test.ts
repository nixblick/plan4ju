// Abort cases of scripts/verify.sh and scripts/release-check.sh, in throwaway git repos (no database).
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const scripts = resolve(__dirname, "../scripts");
let dirs: string[] = [];

function git(cwd: string, ...args: string[]) {
  execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.test", ...args], { cwd, stdio: "ignore" });
}

function repo() {
  const base = mkdtempSync(join(tmpdir(), "verify-test-"));
  dirs.push(base);
  const origin = join(base, "origin.git");
  const work = join(base, "work");
  execFileSync("git", ["init", "-q", "--bare", "-b", "main", origin]);
  execFileSync("git", ["init", "-q", "-b", "main", work]);
  mkdirSync(join(work, "scripts"));
  for (const f of ["verify.sh", "release-check.sh"]) copyFileSync(join(scripts, f), join(work, "scripts", f));
  writeFileSync(join(work, ".gitignore"), "verify/\n");
  git(work, "add", ".");
  git(work, "commit", "-q", "-m", "init");
  git(work, "remote", "add", "origin", origin);
  git(work, "push", "-q", "origin", "main");
  return work;
}

function sh(cwd: string, script: string, ...args: string[]) {
  return spawnSync("bash", [join(cwd, "scripts", script), ...args], { cwd, encoding: "utf8" });
}

afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs = [];
});

describe("scripts/verify.sh", () => {
  it("aborts with 2 on uncommitted changes", () => {
    const work = repo();
    writeFileSync(join(work, "dirty.txt"), "x");
    const r = sh(work, "verify.sh", "--schnell");
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("uncommitted");
  });

  it("aborts with 2 when HEAD is not pushed", () => {
    const work = repo();
    writeFileSync(join(work, "new.txt"), "x");
    git(work, "add", ".");
    git(work, "commit", "-q", "-m", "local");
    const r = sh(work, "verify.sh", "--schnell");
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("push first");
  });

  it("aborts with 2 on an unknown argument", () => {
    expect(sh(repo(), "verify.sh", "--egal").status).toBe(2);
  });
});

describe("scripts/release-check.sh", () => {
  it("refuses without a verify file", () => {
    const r = sh(repo(), "release-check.sh", "1.2.3");
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("no verify/");
  });

  it("refuses a red or quick run and tags a green full run", () => {
    const work = repo();
    const sha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: work, encoding: "utf8" }).trim();
    mkdirSync(join(work, "verify"));
    const file = join(work, "verify", `${sha}.json`);
    const env = { ...process.env, RELEASE_CHECK_SKIP_CI: "1" };
    const run = () => spawnSync("bash", [join(work, "scripts/release-check.sh"), "1.2.3"], { cwd: work, env, encoding: "utf8" });

    writeFileSync(file, `{"sha": "${sha}", "mode": "voll", "status": "red"}`);
    expect(run().status).toBe(1);
    writeFileSync(file, `{"sha": "${sha}", "mode": "schnell", "status": "green"}`);
    expect(run().status).toBe(1);
    writeFileSync(file, `{"sha": "${sha}", "mode": "voll", "status": "green"}`);
    const r = spawnSync("bash", [join(work, "scripts/release-check.sh"), "1.2.3"], {
      cwd: work,
      env: { ...env, GIT_COMMITTER_NAME: "Test", GIT_COMMITTER_EMAIL: "test@example.test" },
      encoding: "utf8",
    });
    expect(r.status).toBe(0);
  });

  it("rejects a malformed version", () => {
    expect(sh(repo(), "release-check.sh", "v1").status).toBe(2);
  });
});
