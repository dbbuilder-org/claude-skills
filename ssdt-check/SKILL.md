---
name: ssdt-check
description: Check SQL stored procedure files for SSDT (SQL Server Data Tools) compatibility. Use when the user asks to "check SSDT compatibility", "ssdt-check", "verify SP headers", "check for SQL70001", or before pushing SQL SP files to a DACPAC project. Scans .sql files for known SSDT parser errors and reports violations.
allowed-tools:
  - Read
  - Bash
  - Glob
  - Grep
---

# SSDT Compatibility Check Skill

Scan SQL stored procedure files for SSDT compatibility issues before they cause build or deploy failures.

## Trigger Phrases

- "ssdt-check", "check SSDT compatibility"
- "check SP headers", "verify stored procedures for SSDT"
- "check for SQL70001 / SQL46010"
- "before pushing SQL files"

## What to Check

Run the checks below against all `.sql` files in the `Stored Procedures/` folders (or the path(s) the user specifies). If no path is given, scan the entire SQL project directory.

---

## Checks (in order)

Write a Python script to `/tmp/ssdt_check.py` and run it. The script must implement ALL of the following rules:

### Rule 1 — No `CREATE OR ALTER PROCEDURE` (SQL70001)
```
Pattern: CREATE\s+OR\s+ALTER\s+PROCEDURE
Action:  ERROR — SSDT does not support CREATE OR ALTER. Must be CREATE PROCEDURE.
```

### Rule 2 — No `SET ANSI_NULLS` anywhere (SQL46010)
```
Pattern: SET\s+ANSI_NULLS
Action:  ERROR — SSDT has no GO separator so any SET before CREATE breaks the parser.
         SSDT defaults ANSI_NULLS ON from the project. Remove the line entirely.
```

### Rule 3 — No `SET QUOTED_IDENTIFIER` anywhere (SQL46010)
```
Pattern: SET\s+QUOTED_IDENTIFIER
Action:  ERROR — Same reason as ANSI_NULLS. Remove entirely.
         Exception: SET QUOTED_IDENTIFIER ON (no semicolon) on its OWN LINE immediately
         before CREATE PROCEDURE (with no blank line between) IS the correct way to
         force QUOTED_IDENTIFIER=ON for a specific SP. This pattern is valid SSDT.
         Flag SET QUOTED_IDENTIFIER anywhere ELSE as an error.
```

### Rule 4 — `CREATE PROCEDURE` must be first non-comment, non-blank line
```
Action:  ERROR — Scan past single-line comments (--) and block comments (/* ... */).
         The first actual code line must start with CREATE PROCEDURE (or CREATE PROC).
         If preceded by SET QUOTED_IDENTIFIER ON (Rule 3 exception), that SET is allowed.
```

### Rule 5 — No `GO` inside the SP body
```
Action:  WARNING — A bare GO on its own line inside the procedure body (between CREATE
         PROCEDURE and the closing END) is a batch separator that splits the SP in half.
         The LAST non-empty line of the file being GO (after END or END;) is CORRECT
         and expected — do NOT flag it.
```

### Rule 6 — No semicolons on actual DDL statements
```
Pattern: Lines that START with ALTER TABLE or ALTER PARTITION (after stripping whitespace)
         and end with a semicolon.
Action:  WARNING — SSDT's T-SQL parser may reject semicolons on DDL.
         Note: Lines that START with SET, --, or any other keyword and merely CONTAIN
         the text "ALTER TABLE" or "ALTER PARTITION" (e.g., string assignments) are
         NOT flagged — only lines where ALTER is the first keyword.
```

### Rule 7 — No `EXEC(` with string concatenation (SQL injection / best practice)
```
Pattern: EXEC\s*\(.*\+
Action:  WARNING — Use sp_executesql with parameters instead of EXEC() with string concat.
```

### Rule 8 — Dynamic object references should use QUOTENAME()
```
Pattern: Dynamic SQL that references table/object names without QUOTENAME()
         Heuristic: N'ALTER TABLE dbo.' followed by a concatenated variable that is NOT
         wrapped in QUOTENAME().
Action:  INFO — Consider wrapping dynamic object names in QUOTENAME() to prevent
         injection and handle special characters.
```

---

## Script Template

Write this Python to `/tmp/ssdt_check.py`:

```python
#!/usr/bin/env python3
"""SSDT Compatibility Checker"""
import re, sys
from pathlib import Path

ERRORS = []
WARNINGS = []
INFOS = []

def check_file(path: Path):
    text = path.read_text(encoding='utf-8', errors='replace')
    lines = text.splitlines()
    name = str(path)

    # Rule 1: CREATE OR ALTER
    for i, line in enumerate(lines, 1):
        if re.search(r'CREATE\s+OR\s+ALTER\s+PROC', line, re.IGNORECASE):
            ERRORS.append(f"[SQL70001] {name}:{i} — CREATE OR ALTER PROCEDURE not allowed in SSDT. Use CREATE PROCEDURE.")

    # Rule 2: SET ANSI_NULLS
    for i, line in enumerate(lines, 1):
        stripped = line.strip()
        if re.match(r'SET\s+ANSI_NULLS', stripped, re.IGNORECASE):
            ERRORS.append(f"[SQL46010] {name}:{i} — SET ANSI_NULLS not allowed. SSDT defaults ON from project settings. Remove this line.")

    # Rule 3: SET QUOTED_IDENTIFIER (allow only immediately before CREATE PROCEDURE)
    for i, line in enumerate(lines, 1):
        stripped = line.strip()
        if re.match(r'SET\s+QUOTED_IDENTIFIER', stripped, re.IGNORECASE):
            # Check if the very next non-blank line is CREATE PROCEDURE
            next_code_line = ''
            for j in range(i, len(lines)):
                ns = lines[j].strip()
                if ns:
                    next_code_line = ns
                    break
            if re.match(r'CREATE\s+(OR\s+ALTER\s+)?PROC', next_code_line, re.IGNORECASE):
                pass  # Valid exception
            else:
                ERRORS.append(f"[SQL46010] {name}:{i} — SET QUOTED_IDENTIFIER in wrong location. Only allowed immediately before CREATE PROCEDURE with no blank lines between.")

    # Rule 4: CREATE PROCEDURE must be first code line (past comments/blanks, and optional SET QI)
    in_block_comment = False
    first_code_line = None
    first_code_lineno = None
    prev_was_set_qi = False
    for i, line in enumerate(lines, 1):
        stripped = line.strip()
        if in_block_comment:
            if '*/' in stripped:
                in_block_comment = False
            continue
        if stripped.startswith('/*'):
            if '*/' not in stripped[2:]:
                in_block_comment = True
            continue
        if not stripped or stripped.startswith('--'):
            continue
        if re.match(r'SET\s+QUOTED_IDENTIFIER', stripped, re.IGNORECASE):
            prev_was_set_qi = True
            continue
        first_code_line = stripped
        first_code_lineno = i
        break

    if first_code_line and not re.match(r'CREATE\s+(OR\s+ALTER\s+)?PROC', first_code_line, re.IGNORECASE):
        ERRORS.append(f"[Rule4] {name}:{first_code_lineno} — First code line must be CREATE PROCEDURE. Found: {first_code_line[:80]}")

    # Rule 5: GO inside body (not last non-empty line)
    last_nonempty = None
    for line in reversed(lines):
        if line.strip():
            last_nonempty = line.strip()
            break
    in_proc = False
    for i, line in enumerate(lines, 1):
        stripped = line.strip()
        if re.match(r'CREATE\s+(OR\s+ALTER\s+)?PROC', stripped, re.IGNORECASE):
            in_proc = True
        if in_proc and re.match(r'^GO\b', stripped, re.IGNORECASE):
            if stripped != last_nonempty:
                WARNINGS.append(f"[Rule5] {name}:{i} — GO inside SP body splits the batch. Only a trailing GO after END is valid.")

    # Rule 6: Semicolons on DDL
    for i, line in enumerate(lines, 1):
        stripped = line.strip()
        if re.match(r'ALTER\s+(TABLE|PARTITION)\b', stripped, re.IGNORECASE) and stripped.endswith(';'):
            WARNINGS.append(f"[Rule6] {name}:{i} — Semicolon on ALTER DDL may cause SSDT parse error. Remove trailing semicolon.")

    # Rule 7: EXEC( with string concatenation
    for i, line in enumerate(lines, 1):
        if re.search(r'\bEXEC\s*\(.*\+', line, re.IGNORECASE):
            WARNINGS.append(f"[Rule7] {name}:{i} — EXEC() with string concat. Use sp_executesql with parameters.")

    # Rule 8: Dynamic SQL without QUOTENAME
    for i, line in enumerate(lines, 1):
        if re.search(r"N'ALTER TABLE dbo\.'", line, re.IGNORECASE):
            if '+' in line and 'QUOTENAME' not in line.upper():
                INFOS.append(f"[Rule8] {name}:{i} — Dynamic object reference may need QUOTENAME().")

files_checked = 0
paths = sys.argv[1:] if len(sys.argv) > 1 else ['.']
for root in paths:
    for sql_file in Path(root).rglob('*.sql'):
        if any(part.startswith('.') for part in sql_file.parts):
            continue
        check_file(sql_file)
        files_checked += 1

print(f"\nSSDT Compatibility Check — {files_checked} file(s) scanned")
print("=" * 60)
if ERRORS:
    print(f"\n{len(ERRORS)} ERROR(S) — will cause build failure:")
    for e in ERRORS:
        print(f"  {e}")
if WARNINGS:
    print(f"\n{len(WARNINGS)} WARNING(S) — may cause deploy failure:")
    for w in WARNINGS:
        print(f"  {w}")
if INFOS:
    print(f"\n{len(INFOS)} INFO:")
    for info in INFOS:
        print(f"  {info}")
if not ERRORS and not WARNINGS and not INFOS:
    print("\nAll checks passed.")
sys.exit(1 if ERRORS else 0)
```

---

## Execution Steps

1. **Determine scope**: If the user specified files or a directory, use that. Otherwise default to `src/MBox.Platform.Infrastructure.SqlServer/` (or equivalent SQL project root found via Glob for `*.sqlproj`).

2. **Write script**: Write the Python above to `/tmp/ssdt_check.py`.

3. **Run**: `python3 /tmp/ssdt_check.py <path>`

4. **Report**: Present the output clearly. For each error/warning, show the file path (absolute, cmd-clickable), line number, and the fix needed.

5. **Fix if asked**: If the user says "fix it" or "fix them", apply the fixes using Edit tool. Each fix is mechanical:
   - SQL70001: Replace `CREATE OR ALTER PROCEDURE` → `CREATE PROCEDURE`
   - SQL46010 (ANSI_NULLS): Delete the line
   - SQL46010 (QUOTED_IDENTIFIER in wrong place): Delete the line
   - Rule 6 (semicolon on DDL): Remove the trailing semicolon

6. **Re-run after fixes** to confirm clean.

---

## Known False Positives to Ignore

- `SET @SQL = N'ALTER TABLE ...'` — this is a string assignment, Rule 6 only fires when `ALTER` is the first keyword
- Trailing `GO` after the closing `END` — this is the correct SSDT batch terminator, Rule 5 excludes the last non-empty line
- `SET QUOTED_IDENTIFIER ON` immediately before `CREATE PROCEDURE` (no blank line between) — Rule 3 exception
