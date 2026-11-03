"""Focused P2 regression. Disposable Git fixtures; no Docker daemon or DB.

Run: python scripts/ops/tests/build-worktree.test.py
Set BASH to the Git Bash executable on Windows if it is not on PATH.
The context check models the deliberately restricted glob policy in .dockerignore;
it is not evidence of a Docker image build or a native Docker context export.
"""
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[3]
BASH = os.environ.get("BASH") or shutil.which("bash")
if not os.environ.get("BASH") and os.name == "nt":
    BASH = r"C:\Program Files\Git\bin\bash.exe"
GATE = ROOT / "scripts/ops/check-build-worktree.sh"
OPS = {
    "backfill-contact-inbound.mjs", "backfill_profile_2026_05_29.ts",
    "cleanup-ghost-nicks.ts", "dedup-globalid-dryrun.mjs",
    "migrate-conv-tab-indexes.mjs", "seed-demo-data.ts", "seed-demo-muctieu.ts",
    "seed-project-blocks.mjs", "split-mismerged-contacts.ts",
    "tg-provisioner-login.mjs", "update-block-greetings.mjs",
    "wave_1_5_backfill.sql", "channels/backfill-message-org-id.ts",
}


def context_includes(path):
    """Last matching rule wins; match file and each parent directory."""
    included = True
    candidates = [path]
    candidates += [p.as_posix() for p in Path(path).parents if str(p) != "."]
    for line in (ROOT / ".dockerignore").read_text(encoding="utf-8").splitlines():
        if not line or line.startswith("#"):
            continue
        negate = line.startswith("!")
        pattern = line.lstrip("!").strip("/")
        # Fail closed on syntax not modeled by this regression.
        if any(c in pattern for c in "?[]\\"):
            raise AssertionError("Extend context regression for pattern: " + line)
        expression = re.escape(pattern).replace(r"\*\*/", "(?:.*/)?")
        expression = expression.replace(r"\*\*", ".*").replace(r"\*", "[^/]*")
        if any(re.fullmatch(expression, p) for p in candidates):
            included = negate
    return included


class GateTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="zalocrm-p2-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.git("init", "-q")
        self.git("config", "user.email", "p2-fixture@example.invalid")
        self.git("config", "user.name", "P2 disposable fixture")
        self.write("backend/src/app.ts", "// fixture\n")
        self.write(".gitignore",
                   "*.local.ts\n*.log\n.env*\nnode_modules/\ndist/\n")
        self.git("add", ".")
        self.git("commit", "-qm", "disposable fixture")

    def git(self, *args):
        return subprocess.run(["git", *args], cwd=self.root, check=True,
                              capture_output=True)

    def write(self, name, content="fixture"):
        p = self.root / name
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(content, encoding="utf-8")

    def gate(self, blocked=None, env=None):
        # Feed only this read-only helper, never deploy.sh.
        result = subprocess.run([BASH, "-s", "--", "."], cwd=self.root,
                                input=GATE.read_text(encoding="utf-8"),
                                text=True, capture_output=True,
                                env={**os.environ, **(env or {})})
        output = result.stdout + result.stderr
        if blocked:
            self.assertEqual(result.returncode, 1, output)
            self.assertIn(blocked, output)
            self.assertIn("commit approved release inputs", output)
        else:
            self.assertEqual(result.returncode, 0, output)

    def test_clean(self):
        self.gate()

    def test_tracked_dirty(self):
        self.write("backend/src/app.ts", "// changed")
        self.gate("backend/src/app.ts")

    def test_staged_dirty(self):
        self.write("backend/src/app.ts", "// staged")
        self.git("add", ".")
        self.gate("backend/src/app.ts")

    def test_untracked_helper_and_no_override(self):
        self.write("backend/scripts/reports-verification/helper.ts")
        self.gate("backend/scripts/reports-verification/helper.ts",
                  {"ALLOW_DIRTY": "1"})

    def test_untracked_space_and_newline(self):
        self.write("backend/helper with spaces.ts")
        self.gate("helper with spaces.ts")
        if os.name != "nt":
            self.write("backend/helper\nnewline.ts")
            self.gate(r"helper\nnewline.ts")

    def test_ignored_build_input(self):
        self.write("backend/src/helper.local.ts")
        self.gate("backend/src/helper.local.ts")

    def test_ignored_verification_helper(self):
        self.write("backend/scripts/reports-verification/helper.local.ts")
        self.gate("backend/scripts/reports-verification/helper.local.ts")

    def test_whole_ignored_directory(self):
        self.write(".git/info/exclude", "backend/scripts/reports-verification/\n")
        self.write("backend/scripts/reports-verification/deep/helper.ts")
        self.gate("backend/scripts/reports-verification/deep/helper.ts")

    def test_tracked_deletion(self):
        (self.root / "backend/src/app.ts").unlink()
        self.gate("backend/src/app.ts")

    def test_ignored_local_outputs_safe(self):
        self.write("backend/node_modules/dummy/index.js")
        self.write("frontend/dist/index.html")
        self.write("backend/.env.fixture", "synthetic-not-a-secret")
        self.write("backend/local.log")
        self.gate()

    def test_ignore_override(self):
        self.write("docker/Dockerfile.dockerignore")
        self.git("add", ".")
        self.git("commit", "-qm", "override fixture")
        self.gate("docker/Dockerfile.dockerignore")


class PackagingTests(unittest.TestCase):
    def test_operational_inventory_and_copy(self):
        dockerfile = (ROOT / "docker/Dockerfile").read_text(encoding="utf-8")
        copies = re.findall(r"^COPY --from=backend-builder (.+)$",
                            dockerfile, re.MULTILINE)
        copied_scripts = set()
        for copy in copies:
            for source in copy.split()[:-1]:
                prefix = "/app/backend/scripts/"
                if source.startswith(prefix):
                    copied_scripts.add(source[len(prefix):])
                self.assertNotEqual(source, "/app/backend/scripts")
        self.assertEqual(copied_scripts, OPS)
        for script in OPS:
            path = "backend/scripts/" + script
            self.assertTrue((ROOT / path).is_file(), path)
            self.assertTrue(context_includes(path), path)

    def test_exclusions(self):
        for path in [
            "backend/scripts/reports-verification/ignored.local.ts",
            "backend/scripts/reports-verification/deep/fixture.sql",
            "backend/scripts/mint-test-jwt.cjs",
            "backend/scripts/tg-provision-test.mjs",
            "backend/scripts/new-unreviewed.ts",
            "backend/scripts/channels/new-unreviewed.ts",
            "backend/tests/test.ts", "backend/promptfoo/fixture.json",
            "backend/src/x.test.ts", "frontend/src/x.dom.spec.ts",
            "frontend/src/acceptance/local.vue", "frontend/public/mockups/x.html",
            "backend/src/__fixtures__/x.json", "backend/src/local-data/x.json",
            "artifacts/log.json", "backend/node_modules/x/index.js",
            "backend/.env.fixture", "frontend/.env.local",
            "backend/local.log", "frontend/dist/index.html",
            "frontend/public/local.xlsx", "docker/Dockerfile.dockerignore",
            "secrets/synthetic.json", ".git/config",
        ]:
            with self.subTest(path=path):
                self.assertFalse(context_includes(path), path)

    def test_build_inputs_retained(self):
        for path in [
            "docker/Dockerfile", "backend/src/app.ts", "backend/tsconfig.json",
            "backend/package.json", "backend/package-lock.json",
            "backend/prisma/schema.prisma", "backend/prisma.config.ts",
            "backend/prisma/migrations/example/migration.sql",
            "backend/prisma/rls/tenant-rls.sql",
            "frontend/package-lock.json", "frontend/tsconfig.app.json",
            "frontend/src/views/ReportsView.vue", "frontend/public/favicon.svg",
        ]:
            self.assertTrue(context_includes(path), path)

    def test_script_inventory_requires_review(self):
        actual = {
            p.relative_to(ROOT / "backend/scripts").as_posix()
            for p in (ROOT / "backend/scripts").rglob("*")
            if p.is_file() and "reports-verification" not in p.parts
        }
        self.assertEqual(actual, OPS | {"mint-test-jwt.cjs", "tg-provision-test.mjs"})

    def test_deploy_integration(self):
        deploy = (ROOT / "scripts/ops/deploy.sh").read_text(encoding="utf-8")
        self.assertIn('BUILD_WORKTREE_GATE="$(cat ', deploy)
        self.assertIn('bash -c "$BUILD_WORKTREE_GATE" -- "$REPO_ROOT"', deploy)
        self.assertIn('run git checkout "$TARGET_SHA"\n'
                      '    ensure_clean_worktree\n'
                      '    run docker compose', deploy)
        self.assertNotIn('${ALLOW_DIRTY:-0}', deploy)
        self.assertIn("FROM node:22-alpine",
                      (ROOT / "docker/Dockerfile").read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
