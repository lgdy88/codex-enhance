from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "codex_session_delete" / "inject_src"
TARGET = ROOT / "codex_session_delete" / "inject" / "renderer-inject.js"


@dataclass(frozen=True)
class CspFinding:
    path: Path
    line_number: int
    rule: str
    snippet: str


CSP_UNSAFE_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("eval-call", re.compile(r"(?<![\w$.])eval\s*\(")),
    ("function-constructor", re.compile(r"(?<![\w$.])(?:new\s+)?Function\s*\(")),
    ("string-timer", re.compile(r"\bset(?:Timeout|Interval)\s*\(\s*['\"`]")),
    ("script-element", re.compile(r"\bcreateElement\s*\(\s*['\"]script['\"]")),
    ("stylesheet-element", re.compile(r"\bcreateElement\s*\(\s*['\"]link['\"]")),
    ("unsafe-eval-token", re.compile(r"\bunsafe-eval\b")),
    ("css-property-rule", re.compile(r"^\s*@property\b")),
    (
        "external-src-resource",
        re.compile(r"\bsrc\s*=\s*(?:['\"][^'\"]*(?:(?:https?:)?//)|`[^`\n]*(?:(?:https?:)?//|\$\{[^}\n]*helperBase))"),
    ),
)


def module_paths() -> list[Path]:
    return sorted(path for path in SOURCE_DIR.glob("*.js") if path.is_file())


def validate_csp_safe_source(paths: list[Path] | None = None) -> list[CspFinding]:
    findings: list[CspFinding] = []
    for path in paths or module_paths():
        for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
            for rule, pattern in CSP_UNSAFE_PATTERNS:
                if pattern.search(line):
                    findings.append(CspFinding(path, line_number, rule, line.strip()))
    return findings


def assert_csp_safe_source(paths: list[Path] | None = None) -> None:
    findings = validate_csp_safe_source(paths)
    if not findings:
        return
    lines = [
        "CSP-unsafe renderer source found. Avoid eval/new Function, string timers, script/link injection, @property rules, and external src resources.",
    ]
    lines.extend(f"- {finding.path}:{finding.line_number} [{finding.rule}] {finding.snippet}" for finding in findings)
    raise RuntimeError("\n".join(lines))


def build_renderer() -> str:
    assert_csp_safe_source()
    parts = []
    for path in module_paths():
        text = path.read_text(encoding="utf-8").rstrip()
        parts.append(text)
    return "\n\n".join(parts) + "\n"


def main() -> int:
    if not SOURCE_DIR.exists():
        raise SystemExit(f"renderer source directory not found: {SOURCE_DIR}")
    TARGET.write_text(build_renderer(), encoding="utf-8")
    print(f"built {TARGET}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
