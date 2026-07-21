---
name: sp-audit
description: Cross-reference SQL Server stored procedure parameters against C# service calls to find missing params (500 risk) and extra params (silent data loss)
trigger: /sp-audit
---

# SP Audit Skill

Cross-reference all `usp_*` stored procedures in a SQL Server database against every `.cs` file in a C# project to find parameter mismatches.

## Script location

`/Users/admin/dev2/scripts/sp-audit.py`

## Usage

```
/sp-audit
/sp-audit --project ~/dev2/someproject/SomeAPI --server sqltest --db SomeDB
```

## What it finds

1. **SP called from C# but not in DB** — guaranteed 500 error
2. **Extra params in C# not in SP** — SQL Server silently ignores them; data is passed but never stored
3. **Missing required params** — SP params C# isn't passing; may cause 500 (see caveat below)

## How to run

```bash
python3 /Users/admin/dev2/scripts/sp-audit.py [--project PATH] [--server SERVER] [--db DATABASE] [--output report.md]
```

Defaults to FireProof: `--project ~/dev2/fireproof/backend/FireExtinguisherInspection.API --server sqltest --db FireProofDB`

## Important caveat: `has_default_value` limitation

`sys.parameters.has_default_value = 0` even for params declared `= NULL` in the SP body. SQL Server metadata does NOT reliably report whether a param has a default. This means:

- **Extra params section**: reliable — these are real issues
- **Missing required params section**: over-reports; many are false positives because `= NULL` defaults look "required" in metadata. Manually verify each before fixing.

To confirm a "missing required" finding: `sp_helptext 'usp_Foo_Bar'` and look for `= NULL` or `= 0` on the param in question.

## Interpreting results

Run after any SP change to check for drift. The silent data-loss bugs are harder to notice than 500 errors — prioritize the "extra params" section.

## FireProof baseline (2026-04-28)

- 225 SPs, 156 call sites, 30 issues found
- Bugs fixed: `usp_Extinguisher_Create` @LastServiceDate (script 086), `usp_Location_Update` barcode wipe (script 087), `usp_Inspection_Create` @DeviceId (script 087)
