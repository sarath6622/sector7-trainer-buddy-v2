#!/usr/bin/env python3
"""PreToolUse(Bash) guard for Sector 7 Rule 0.

Intercepts schema-mutating Prisma commands (`migrate dev`, `migrate reset`,
`db push`, `db execute`) and forces a confirmation prompt if they would target a
NON-local database. The footgun: Prisma's CLI reads `.env` (Neon) by default,
while the local Docker DB lives in `.env.local`. A naive `npx prisma migrate dev`
therefore hits production unless the local DATABASE_URL is forced.

Fails open: any parse/IO error -> exit 0 (allow), so it can never wedge Bash.
"""
import sys, json, re, os

LOCAL_TOKENS = ("localhost", "127.0.0.1", ".env.local")
MUTATING = ("migrate dev", "migrate reset", "db push", "db execute")


def database_host(env_path):
    """Return the host portion of DATABASE_URL in env_path, or None."""
    try:
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line.startswith("DATABASE_URL"):
                    m = re.search(r"@([^/:?]+)", line)
                    if m:
                        return m.group(1)
    except Exception:
        pass
    return None


def main():
    try:
        data = json.load(sys.stdin)
    except Exception:
        sys.exit(0)

    cmd = ((data.get("tool_input") or {}).get("command") or "")
    low = cmd.lower()

    if "prisma" not in low:
        sys.exit(0)
    if not any(p in low for p in MUTATING):
        sys.exit(0)
    # Command explicitly forces a local target -> fine.
    if any(tok in low for tok in LOCAL_TOKENS):
        sys.exit(0)

    project = os.environ.get("CLAUDE_PROJECT_DIR") or "."
    host = database_host(os.path.join(project, ".env"))
    if host and ("localhost" in host or "127.0.0.1" in host):
        sys.exit(0)

    target = host or "an UNKNOWN/remote database (default .env DATABASE_URL)"
    reason = (
        f"⚠️ Rule 0 guard: this Prisma command targets {target}, NOT the "
        "local Docker Postgres. Migrations must run on LOCAL Docker first. Re-run "
        "prefixed with the local URL:\n"
        "  DATABASE_URL='postgresql://sector7:sector7pass@localhost:5432/sector7' \\\n"
        "    <your prisma command>\n"
        "or use the /new-migration skill. Only continue against a remote DB if this "
        "is a deliberate, already-proven deploy (prisma migrate deploy)."
    )
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "ask",
            "permissionDecisionReason": reason,
        }
    }))
    sys.exit(0)


if __name__ == "__main__":
    main()
