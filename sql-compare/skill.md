---
name: sql-compare
description: Compare two SQL Server databases that share a base schema but have diverged. Diffs objects, table columns, SP parameter lists, and SP body text. In full mode generates best-of-both reconciliation SQL with _OLD_<db>_<YYYYMMDD>_<Name> versioned backups before any overwrite. Use when the user says "sql-compare", "compare databases", "db diff", "sync databases", "best of both", or "compare two SQL databases".
allowed-tools:
  - Read
  - Write
  - Bash
  - AskUserQuestion
---

# /sql-compare

Compare two SQL Server databases that share a common ancestry but have diverged.
Produces a diff report and — in `full` mode — ready-to-run reconciliation SQL that brings
each database to the best-of-both state, with `_OLD_<db>_<YYYYMMDD>_<Name>` versioned
backups created before any object is overwritten.

---

## Usage

```
/sql-compare                                                    # prompts for all args
/sql-compare TEST_ECOMMERCE_Windermere TEST_ECOMMERCE_Westmoreland
/sql-compare --db-a DB1 --db-b DB2 --mode name                  # object list only
/sql-compare --db-a DB1 --db-b DB2 --mode code                  # + definition diffs
/sql-compare --db-a DB1 --db-b DB2 --mode full                  # + columns + params + reconcile SQL
/sql-compare --db-a DB1 --db-b DB2 --sp-filter Product          # only diff SPs containing "Product"
/sql-compare --db-a DB_Live --db-b DB_Backup --server-a host,1433 --uid sa --pwd secret
```

---

## Modes

| Mode | What it does |
|------|-------------|
| `name` | Object-level diff only — what exists in one DB but not the other, grouped by type (tables, SPs, views, functions). Fast. |
| `code` | `name` + unified diff of every diverged SP/view/function definition. |
| `full` | `code` + column-level table diff + SP parameter comparison + reconciliation SQL with `_OLD_` versioned backups. Default. |

---

## Script

```
/Users/admin/dev2/scripts/sql-compare-db.py
```

---

## Execution Steps

### Step 1 — Gather connection info

Check `~/.config/claude/credentials.md` for pre-configured credentials.

**SchoolVision defaults** (used automatically when no `--server-a` / `--uid` / `--pwd` are given):
- Server: `sqltest.schoolvision.net,14333`
- UID: `sv` / PWD: from `~/.config/claude/credentials.md` → FireProof section, SQL Server Connection row (never hardcode — this file is committed to GitHub)
- Tenant DBs: `TEST_ECOMMERCE_Windermere`, `TEST_ECOMMERCE_Westmoreland`, `TEST_ECOMMERCE_SVDemo`

If the user invokes without arguments, ask:
1. DB A name
2. DB B name
3. Mode (`name` / `code` / `full` — default `full`)
4. Optional: server, credentials if not SchoolVision staging

Also ask: output directory (default: `code-review/<YYYY-MM-DD>/` in the current project, or `~/` if not in a project).

### Step 2 — Run the script

```bash
python3 /Users/admin/dev2/scripts/sql-compare-db.py \
  --db-a <DB_A> \
  --db-b <DB_B> \
  [--server-a <host,port>] \
  [--server-b <host,port>] \
  [--uid <user>] [--pwd <password>] \
  [--mode name|code|full] \
  [--sp-filter <substring>] \
  --output <output_dir>
```

**PaymentAPI one-liner (all three tenant DBs, Windermere vs Westmoreland):**
```bash
python3 /Users/admin/dev2/scripts/sql-compare-db.py \
  --db-a TEST_ECOMMERCE_Windermere \
  --db-b TEST_ECOMMERCE_Westmoreland \
  --mode full \
  --output /Users/admin/dev2/michaeljr/PaymentAPI-original/code-review/$(date +%F)/
```

Capture stdout for progress messages; the script writes files directly to `--output`.

### Step 3 — Review output

The script produces up to three files in `--output`:

| File | Always? | Contents |
|------|---------|---------|
| `compare-<A>-vs-<B>-<YYYYMMDD>.md` | Yes | Full diff report (exec summary + object lists + column diffs + SP diffs + conflict diffs) |
| `sync-to-<B>-<YYYYMMDD>.sql` | `full` mode only | SQL to run against DB-B to bring it to best-of-both state |
| `sync-to-<A>-<YYYYMMDD>.sql` | `full` mode only | SQL to run against DB-A to bring it to best-of-both state |

Read the markdown report and parse the Executive Summary table to get counts.

### Step 4 — Report to user

Tell the user:
- Object-only-in-A / object-only-in-B counts broken down by type
- Tables with column differences (and whether any have type conflicts requiring manual review)
- Diverged SPs: how many auto-resolved vs how many are CONFLICT
- Path to the report markdown
- If `full` mode: paths to the two sync SQL files and how to apply them

If there are CONFLICT SPs, show their names and the reason — these need human decision before the sync SQL can be finalized.

---

## What "Best of Both" Means

For each SP that exists in both DBs but has diverged, the script picks a winner:

| Heuristic | Winner |
|-----------|--------|
| One body is a stub (`WHERE 1=0`, no `FROM`, < 8 code lines) | The non-stub |
| One has significantly more parameters (> 1 more non-default param) | The one with more params |
| One body is >30% longer AND >200 chars more | The longer one |
| One has `TRY/CATCH` error handling, the other doesn't | The one with error handling |
| No clear winner | `CONFLICT` — shown in report, excluded from sync SQL |

**Conflicts are never auto-applied.** They appear in the report with a full unified diff
so a human can decide which version (or a manual merge) should be used.

---

## Versioning Convention

Before any SP is overwritten, the displaced version is preserved with an `_OLD_` prefix:

```sql
-- Backing up Westmoreland's version before replacing with Windermere's:
CREATE OR ALTER PROCEDURE [dbo].[_OLD_Westmoreland_20260501_SelectProductList]
AS
  -- (original Westmoreland body)
GO

-- Applying Windermere's version:
CREATE OR ALTER PROCEDURE [dbo].[SelectProductList]
AS
  -- (Windermere body — best-of-both winner)
GO
```

Format: `_OLD_<shortDbName>_<YYYYMMDD>_<OriginalName>`

`shortDbName` is derived from the DB being overwritten:
- `TEST_ECOMMERCE_Windermere` → `Windermere`
- `TEST_ECOMMERCE_Westmoreland` → `Westmoreland`
- `TEST_ECOMMERCE_SVDemo` → `SVDemo`

These `_OLD_` objects accumulate and can be cleaned up later with:
```sql
-- Find all _OLD_ backups older than 90 days:
SELECT name FROM sys.procedures WHERE name LIKE '_OLD_%' ORDER BY name;
```

---

## Column Differences

For tables present in both DBs:

- **Column only in A**: `ALTER TABLE ... ADD col TYPE NULL` generated in `sync-to-B.sql`
- **Column only in B**: `ALTER TABLE ... ADD col TYPE NULL` generated in `sync-to-A.sql`
- **Same column, different type**: flagged as `⚠️ CONFLICT` in the report — **not** auto-applied (could fail or lose data)
- **Same column, different nullability/default**: flagged as `INFO` only

---

## Comparing Three Databases

To compare all three PaymentAPI tenant DBs, run the skill twice:

```bash
# Windermere vs Westmoreland
/sql-compare TEST_ECOMMERCE_Windermere TEST_ECOMMERCE_Westmoreland

# Windermere vs SVDemo
/sql-compare TEST_ECOMMERCE_Windermere TEST_ECOMMERCE_SVDemo
```

Then cross-reference the two reports to identify objects/columns that need to be
applied to all three databases.

---

## Applying the Sync Scripts

After reviewing the generated SQL, apply with `sqlcmd` or SSMS:

```bash
# Apply sync-to-Westmoreland first (safer: creates _OLD_ backups before overwriting)
# $SV_SQL_PWD = vault → FireProof → SQL Server Connection row
sqlcmd -S sqltest.schoolvision.net,14333 \
       -d TEST_ECOMMERCE_Westmoreland \
       -U sv -P "$SV_SQL_PWD" \
       -i sync-to-Westmoreland-20260501.sql

# Then apply sync-to-Windermere
sqlcmd -S sqltest.schoolvision.net,14333 \
       -d TEST_ECOMMERCE_Windermere \
       -U sv -P "$SV_SQL_PWD" \
       -i sync-to-Windermere-20260501.sql
```

Always review the SQL before running — the script is conservative (adds nullable columns,
backs up before replacing SPs) but a human should verify CONFLICT items first.

---

## Iterative Use

After applying the sync scripts, re-run `/sql-compare` to verify the gap is closed:

```
/sql-compare TEST_ECOMMERCE_Windermere TEST_ECOMMERCE_Westmoreland --mode full
```

The new report should show 0 diverged SPs and 0 column differences if the sync was complete.
