---
name: code-review-data-tiers
description: >
  Full-stack data layer mismatch audit. Detects column name mismatches,
  missing tables/columns, positional ordinal drift, SP parameter drift,
  SP result column vs reader mismatches, DTO property misalignment, TypeORM
  entity @Column name= drift, QueryBuilder column ref drift, the
  empty-string Guid anti-pattern in Vue/React forms, SP data filter gates
  (hardcoded WHERE IsActive=1 that silently exclude rows), and VB.NET
  DataBroker pattern (myValues/BuildSqlParameter/DataStorageItem). Covers
  SQL Server (Dapper / SqlCommand / VB.NET DataBroker), Postgres
  (NpgsqlDataReader / Dapper / TypeORM), and Prisma.
trigger: /code-review-data-tiers
---

# Skill: /code-review-data-tiers

Cross-reference every data layer: DB schema ↔ stored procedures ↔ C#/VB.NET raw SQL
↔ GetOrdinal/myValues reads ↔ DTO properties ↔ TypeScript interfaces ↔ Vue/React form bindings.
Also covers NestJS + TypeORM: entity files ↔ migrations ↔ service QueryBuilder conditions ↔ class-validator DTOs.

## Taxonomy of issues (what this catches)

| Class | Example bug | Severity | Symptom |
|---|---|---|---|
| Missing table | `CustomerUserSessions` INSERT, table never created | CRITICAL | 500 on every call |
| Missing column | `QrCodeData` in raw SQL UPDATE, column not in DB | CRITICAL | 500 on every call |
| Wrong column name | `l.Address` → `l.AddressLine1`, `loc.Name` → `loc.LocationName` | CRITICAL | SqlException at runtime |
| Column name drift | `UpdatedAt` vs `ModifiedDate`, `LastLoginAt` vs `LastLoginDate` | CRITICAL | SqlException or silent null |
| SP param missing from SP | C# sends `@LastServiceDate`, SP doesn't accept it | CRITICAL | 500 on every call |
| SP param missing from C# | SP requires param, C# doesn't pass it (no DEFAULT) | CRITICAL | 500 on every call |
| SP result column mismatch | SP SELECTs `LocationCode`, reader calls `GetOrdinal("LocationName")` | CRITICAL | InvalidOperationException |
| Positional ordinal drift | `reader.GetString(5)` — breaks silently when schema changes | WARNING | Wrong data, no error |
| Empty-string Guid | Vue `<select>` sends `""` for `Guid?` field | WARNING | HTTP 400 from [ApiController] |
| DTO nullable mismatch | DTO `Guid LocationId` (non-null) but DB column is nullable | WARNING | Insert failure on NULL |
| TS interface type mismatch | TS `id: string` vs C# `Guid? Id` | INFO | Unexpected 400 |
| Drizzle: unknown table ref | `db.query.nonExistent.findFirst()` — table not in Drizzle schema | CRITICAL | TRPCError / runtime exception |
| Drizzle: insert unknown key | `db.insert(orders).values({ badKey: val })` — ts_key not in table schema | WARNING | Data silently not persisted |
| Drizzle: update unknown key | `db.update(orders).set({ badKey: val })` — ts_key not in table schema | WARNING | Data silently not persisted |
| Drizzle: select unknown table | `db.select().from(nonExistent)` — table not in schema | CRITICAL | Runtime exception |
| Prisma `engineType` + adapter conflict | `engineType = "binary"` in schema.prisma while `@prisma/adapter-pg` is in use | CRITICAL | P1010 'User was denied access' on every query (zero pg pool connections) |
| Prisma model not in schema | `prisma.nonExistentModel.findMany()` | CRITICAL | PrismaClientValidationError at runtime |
| Prisma `select` field drift | `prisma.user.findMany({ select: { nonExistentField: true } })` | WARNING | Silently ignored by Prisma, indicates typo or stale code |
| Prisma `data` field drift | `prisma.invoice.create({ data: { nonExistentCol: val } })` | WARNING | Silently ignored, data not persisted |
| TypeORM `@Column()` missing `name=` | `@Column() kycStatus` → implied col is `kyc_status` ✓, but undocumented; any rename breaks silently | WARNING | Silent snake_case drift when property is renamed |
| TypeORM QueryBuilder column ref | `.where('u.kyc_status = :v')` but `kyc_status` not in entity schema | CRITICAL | TypeORM QueryFailedError at runtime |
| TypeORM raw `queryRunner.query()` | Template literal SQL referencing nonexistent table/column | CRITICAL | QueryFailedError at runtime |
| VB.NET `myValues("Col")` mismatch | `myValues("AddressLine1")` but SP SELECTs `Address` | CRITICAL | InvalidCastException or wrong field |
| VB.NET SP param drift | `BuildSqlParameter(..., "@SalonID")` but SP uses `@LocationID` | CRITICAL | 500 on every call |
| SP data filter gate | `WHERE IsActive=1` in SP body — rows with `IsActive=0` silently excluded | INFO | Empty results, no error |

## Script

```
/Users/admin/dev2/scripts/data-tier-audit.py
```

## Usage

```
/code-review-data-tiers
/code-review-data-tiers --project ~/dev2/fireproof/backend/FireExtinguisherInspection.API --frontend ~/dev2/fireproof/frontend/fire-extinguisher-web/src --server sqltest --db FireProofDB
/code-review-data-tiers --db SomeDB --no-live-db   # schema from .sql files only
/code-review-data-tiers --db-type postgres --pg-dsn "postgresql://user:pass@host/db"
/code-review-data-tiers --prisma ~/dev2/myapp/prisma/schema.prisma --no-live-db

# DoGood NX monorepo (Prisma 7 + PostgreSQL + NestJS + Next.js)
/code-review-data-tiers \
  --prisma platform/libs/prisma-client/prisma/schema.prisma \
  --project platform/apps/api/src \
  --frontend platform/apps/web/src \
  --db-type postgres \
  --no-live-db

# AestheticIQ (Next.js 15 + Prisma + PostgreSQL — monorepo)
/code-review-data-tiers \
  --prisma /Users/admin/dev2/clients/chrisrosburg/AestheticIQ/libs/data-access/database/prisma/schema.prisma \
  --project /Users/admin/dev2/clients/chrisrosburg/AestheticIQ/apps/web \
  --frontend /Users/admin/dev2/clients/chrisrosburg/AestheticIQ/apps/web/app \
  --db-type postgres \
  --no-live-db

# Story Magic (Next.js 14 + Prisma + PostgreSQL — pnpm dual-schema monorepo)
# Two separate Prisma clients share the same database. Run both:
#
# 1. Web schema (33 models: Profile, Project, Job, Usage, Subscription, ImpactStory, …)
/code-review-data-tiers \
  --prisma /Users/admin/dev2/clients/RyanJae/story-magic/packages/web/prisma/schema.prisma \
  --project /Users/admin/dev2/clients/RyanJae/story-magic/packages \
  --frontend /Users/admin/dev2/clients/RyanJae/story-magic/packages/web/app \
  --db-type postgres \
  --no-live-db \
  --output story-magic-data-tier-web-$(date +%F).md
#
# 2. Orchestrator schema (2 models: Project, Purchase — rest uses raw SQL)
/code-review-data-tiers \
  --prisma /Users/admin/dev2/clients/RyanJae/story-magic/packages/orchestrator/prisma/schema.prisma \
  --project /Users/admin/dev2/clients/RyanJae/story-magic/packages/orchestrator/src \
  --db-type postgres \
  --no-live-db \
  --output story-magic-data-tier-orchestrator-$(date +%F).md
#
# Note: orchestrator raw SQL for voice_map / tts_stems / job updates is caught by Phase 2N
# TypeScript template-literal mining even without a matching model in the schema.

# U-Rent NX monorepo (NestJS + TypeORM + PostgreSQL + Next.js)
/code-review-data-tiers \
  --typeorm /Users/admin/dev2/clients/U-Rent/u-rent-platform/apps/api/src/database/entities \
  --migrations /Users/admin/dev2/clients/U-Rent/u-rent-platform/apps/api/src/database/migrations \
  --project /Users/admin/dev2/clients/U-Rent/u-rent-platform/apps/api/src \
  --frontend /Users/admin/dev2/clients/U-Rent/u-rent-platform/apps/web/src \
  --db-type postgres \
  --no-live-db \
  --output urent-data-tier-$(date +%F).md

# FaithVision (.NET 9 + Dapper + SQL Server + Vue 3 + NSwag — live Azure DB)
python3 /Users/admin/dev2/scripts/data-tier-audit.py \
  --project /Users/admin/dev2/FaithVision/src/api/src \
  --sql-scripts /Users/admin/dev2/FaithVision/database/StoredProcedures \
  --frontend /Users/admin/dev2/FaithVision/src/ui/src \
  --server sql-fv-test.database.windows.net \
  --db FaithVision3 \
  --output data-tier-audit-$(date +%F).md

```

## Stack Support

| Dimension | Supported |
|-----------|-----------|
| **Databases** | SQL Server (pyodbc) · PostgreSQL (psycopg2) · Prisma schema · TypeORM entities · `.sql` fallback |
| **DB type flag** | `--db-type sqlserver\|postgres\|auto` (default: auto-detect) |
| **Backends** | C# / .NET (SqlCommand + NpgsqlCommand) · **VB.NET DataBroker** (myValues/BuildSqlParameter/DataStorageItem) · Node.js/TypeScript (NestJS + TypeORM) · Python (FastAPI / SQLAlchemy) |
| **Frontends** | Vue 3 (`.vue`) · React / Next.js (`.tsx`) · plain TypeScript (`.ts`) |
| **ORM support** | TypeORM (`@Entity`/`@Column` entities + `createQueryBuilder`) · Prisma (`prisma.table.method`) · **Drizzle** (`pgTable` schema parse + `db.query.*` / `db.insert().values()` / `db.update().set()` / `db.select().from()` mining via Phase 1H + 2R) · raw pool.query() |
| **Type schemas** | TypeScript `interface`, `type`, class-validator DTOs (`@IsString`, `@IsOptional`…), Zod `z.object()` |

**CLI flags for multi-stack:**
```bash
--db-type postgres          # Force postgres convention (snake_case ↔ PascalCase)
--pg-dsn "postgresql://..."  # Postgres connection string
--prisma path/to/schema.prisma  # Use Prisma schema (no live DB needed)
--drizzle path/to/schema.ts    # Use Drizzle schema file (or dir) — enables Phase 1H + 2R
--typeorm path/to/entities  # Use TypeORM entity files as schema source (forces backend=nodejs, db_type=postgres)
--migrations path/to/migrations  # Supplement TypeORM entities with migration SQL (for tables not yet in entities)
--no-live-db                # Schema from .sql files / Prisma / TypeORM / Drizzle schema only
```

# LaptopReturn.com Portal (Next.js 15 + Drizzle ORM + PostgreSQL/Supabase + tRPC)
/code-review-data-tiers \
  --drizzle /Users/admin/dev2/clients/ryanbilak/laptopreturn-portal/portal/src/lib/db/schema.ts \
  --project /Users/admin/dev2/clients/ryanbilak/laptopreturn-portal/portal/src \
  --frontend /Users/admin/dev2/clients/ryanbilak/laptopreturn-portal/portal/src/app \
  --db-type postgres \
  --no-live-db \
  --output /Users/admin/dev2/clients/ryanbilak/laptopreturn-portal/data-tier-audit-$(date +%F).md

# With live Supabase DB (replace DSN from portal/.env.local):
/code-review-data-tiers \
  --drizzle /Users/admin/dev2/clients/ryanbilak/laptopreturn-portal/portal/src/lib/db/schema.ts \
  --project /Users/admin/dev2/clients/ryanbilak/laptopreturn-portal/portal/src \
  --frontend /Users/admin/dev2/clients/ryanbilak/laptopreturn-portal/portal/src/app \
  --db-type postgres \
  --pg-dsn "postgresql://postgres.[ref]:[password]@aws-0-us-east-1.pooler.supabase.com:5432/postgres" \
  --output /Users/admin/dev2/clients/ryanbilak/laptopreturn-portal/data-tier-audit-$(date +%F).md

FireProof defaults:
```bash
python3 /Users/admin/dev2/scripts/data-tier-audit.py \
  --project ~/dev2/fireproof/backend/FireExtinguisherInspection.API \
  --sql-scripts ~/dev2/fireproof/database/scripts \
  --frontend ~/dev2/fireproof/frontend/fire-extinguisher-web/src \
  --server sqltest.schoolvision.net,14333 --db FireProofDB \
  --output data-tier-audit-$(date +%F).md
```

PaymentAPI (VB.NET + SQL Server + Vue 2.7 POSAdmin frontend):
```bash
python3 /Users/admin/dev2/scripts/data-tier-audit.py \
  --project /Users/admin/dev2/michaeljr/PaymentAPI-original \
  --sql-scripts /Users/admin/dev2/michaeljr/PaymentAPI-original/database/migrations \
  --frontend /tmp/posadmin/src \
  --server sqltest.schoolvision.net,14333 --db TEST_ECOMMERCE_Windermere \
  --output data-tier-audit-paymentapi-$(date +%F).md
```
Stack auto-detected as `backend=dotnet-vb` from `.vbproj` → activates Phase 2E (DataBroker mining) and Phase 2F (SP filter gate).

**Note:** The `--server` arg must be the full hostname (e.g. `sqltest.schoolvision.net,14333`), not the alias `sqltest`. The script connects via pyodbc using `sv` credentials from memory.

## Phases (what the script runs)

### Phase 1: Live DB schema extraction
- `INFORMATION_SCHEMA.COLUMNS` → table→column→type→nullable map
- `sys.parameters` + `sp_helptext` → SP param lists + result column aliases
- Falls back to parsing `--sql-scripts` directory if `--no-live-db`
- **1C (Prisma)**: parses `schema.prisma` models + `@@map`/`@map` annotations → table/column names
- **1D (Prisma generator)**: reads the `generator client { }` block — extracts `engineType`, `previewFeatures`, etc. for adapter-compatibility checks
- **1E (adapter scan)**: scans backend files for `@prisma/adapter-*` imports and `new PrismaPg/PrismaLibSQL/...` instantiations
- **1F (TypeORM entities)**: parses `*.entity.ts` files — `@Entity('table')` → table name; `@Column({ name: 'col' })` → authoritative DB col; `@PrimaryGeneratedColumn` → `id`; `@CreateDateColumn` → `created_at`; `@UpdateDateColumn` → `updated_at`; `@DeleteDateColumn` → `deleted_at`; implicit `@Column()` with no `name=` warns only when camelCase→snake_case differs (e.g. `kycStatus` → `kyc_status` is real drift, `status` → `status` is not)
- **1G (TypeORM migrations)**: reads `*.ts` migration files, extracts SQL only from `up()` blocks (`queryRunner.query(\`...\`)`), parses CREATE TABLE and ALTER TABLE ADD COLUMN — supplements entity schema for tables/columns not yet in entity files

### Phase 2: C# / VB.NET service mining

**C# (backend=dotnet)**
- **Named ordinals** (`GetOrdinal("ColumnName")`) — extract column names per file
- **Positional ordinals** (`reader.GetString(2)`) — flag every occurrence
- **Raw SQL blocks** — extract `CommandText = @"..."`, parse FROM/JOIN aliases,
  extract `alias.ColumnName` refs, cross-check against live schema
- **SP call sites** — extract SP name + `AddWithValue("@Param")` list per call site

**Phase 2E: VB.NET DataBroker (backend=dotnet-vb)**
Auto-detected from `.vbproj`. Extracts:
- `myValues("ColumnName")` reads → named column reads (equivalent to C# `GetOrdinal`)
- `DataStorageItem(StorageType.Sql, "SPName")` → SP name associated with this class
- `BuildSqlParameter(sqlparams, "@Param", ...)` → params passed to that SP
- `CommandText = "..."` raw SQL blocks → alias map + column ref cross-check (same as C#)
- `New SqlParameterList(userId, userKey)` → implicitly adds `@UserID`/`@UserKey` to every call so WARNINGs
  don't fire for these framework-injected params; CRITICAL suppressed for SPs that don't declare them

**SP param drift is split into two passes (SQL Server only):**
- `sys.parameters.is_output` separates INPUT vs OUTPUT params — `@IsValid OUTPUT` is never in `BuildSqlParameter`
- `sys.parameters.has_default_value` marks optional INPUT params — omitting them is not an error
- CRITICAL: code sends a param the SP doesn't declare at all (even considering OUTPUT params)
- WARNING: code omits a required INPUT param (no DEFAULT on SP side)

**Phase 2F: SP data filter gate detection (SQL Server projects)**
Scans every SP body (from live DB `sp_helptext`) for hardcoded boolean filters:
`WHERE/AND/OR colName = 0|1`  
Uses `(?:\w+\.)*(\w+)` pattern (not `[\w.]*\.?(\w+)`) to correctly parse table-aliased columns
like `SPT.IsActive` — the old pattern only captured the last character due to greedy backtracking.
Only flags columns that:
- exist in a real DB table (not a local var)
- look boolean/status (name contains: active, valid, enabled, visible, show, retail, taxable, online)
- are NOT in the intentional-skip list (isprotected, isdeleted, tenantid, salonid…)

Result: **INFO** finding per SP, naming the table and column. Lets you verify that
all expected rows satisfy the filter — or that the data population is incomplete.

**Real example caught (PaymentAPI 2026-04-30):**
```
SP: SelectProductTypeList_ByLocation
WHERE (P.IsProtected=0) AND SPT.IsActive=1
→ Salon_ProductType had IsActive=0 for 7 store types (SalonID=57737001)
→ "Store General" and 6 other types silently missing from POS Admin dropdown
Fix: UPDATE Salon_ProductType SET IsActive=1 WHERE ... (migration 047)
```

### Phase 3: SP definition parsing
From .sql files: extract param list + SELECT result column aliases per SP.
Diff against Phase 2 call sites.

### Phase 4: DTO mining
Extract `public Type? PropName { get; set; }` from C# model files.
Cross-check property names (PascalCase) against DB column names.

### Phase 5: TypeScript interface mining
Extract fields from `interface Foo { bar: string | null }`.
Cross-check (camelCase→PascalCase transform) against DTO properties.

### Phase 6: Empty-string Guid detection in Vue/TS
- Find `*Id: ''` initializations and `v-model` on `<select>` bound to `*Id`
- Flag any that reach an API payload without `|| null` or `?? null` coercion

### Phase 2D: Prisma select/data field validation
For each `prisma.Model.method({ select: { ... }, data: { ... } })` call:
- Extracts field names from `select` and `data` blocks (brace-balanced extraction, not regex)
- Cross-checks each field against the Prisma schema for that model (camelCase → snake_case aware)
- Flags fields that don't exist in the schema as WARNING — Prisma silently ignores them
- Skips Prisma meta-keys (`include`, `where`, `orderBy`, etc.) and relation fields (detected by context)

### Phase 2N: NestJS/TypeORM service mining (backend=nodejs, orm=typeorm)
- **Keyword filter**: expands to include `Repository`, `createQueryBuilder`, `queryRunner`, `dataSource`, `InjectRepository`, `getRepository`, `TypeOrmModule`
- **Raw template literals**: `dataSource.query(\`...\`)` / `queryRunner.query(\`...\`)` — extracts SQL, parses FROM/JOIN alias map, cross-checks `alias.col` refs against Phase 1F/1G schema
- **QueryBuilder conditions**: `.where('alias.col_name = :param')` / `.andWhere(...)` / `.orWhere(...)` — extracts `alias.col` pairs, cross-checks `col_name` against entity schema using symmetric snake_case matching (`pascal_to_snake(code_name) == pascal_to_snake(db_col)` → catches `kycStatus` vs `kyc_status`)
- **class-validator DTOs**: scans `*.dto.ts` and any `*.ts` with `@Is*` / `@Min` / `@Max` decorators inside exported classes matching `*Dto|*Request|*Response` naming pattern

### Phase 7: Cross-reference and report
One matrix per entity (DB table). Flat severity list. Auto-fix plan.

## Key alias resolution heuristic (multi-table JOIN detection)

When a raw SQL block has multiple FROM/JOIN tables, the script builds an alias
map from the SQL text itself:

```
FROM dbo.Extinguishers e     → e = Extinguishers
JOIN dbo.Locations l          → l = Locations
JOIN dbo.ExtinguisherTypes et → et = ExtinguisherTypes
```

Then `e.Barcode` → look up `Barcode` in Extinguishers schema.
If not found → CRITICAL: column does not exist on aliased table.

Aliases are extracted with:
```
(?:FROM|JOIN)\s+dbo\.(\w+)\s+(?:AS\s+)?(\w+)
```

## SP result column diff

For each SP that returns a result set, the script:
1. Parses **all top-level (depth-0) SELECT blocks** from sp_helptext output — many payment SPs have
   multiple result sets (e.g. wallet data SELECT + transaction list SELECT + summary SELECT)
2. Extracts column aliases from both `expression AS Alias` and T-SQL `Alias = expression` style
3. Compares against every `reader.GetOrdinal("X")` / `myValues("X")` call in the matching service method
4. Flags: column name in reader that doesn't appear in ANY top-level SELECT alias → CRITICAL

This catches the class of bug where the SP adds a column and the ordinal positions
drift, causing the reader to silently read the wrong field.

**Key fix applied 2026-05-01:** `_trim_select_to_from` now correctly handles `FROM` embedded in
identifier names (e.g. `@AT_From AS AccountTransactionID_From`) — was incorrectly cutting the
SELECT column list at the `From` in `@AT_From`, causing all aliases to be missed.

## False positive suppression

- Computed columns (`COUNT(*) AS TotalItems`, `FirstName + ' ' + LastName AS FullName`) are valid — don't flag
- Properties with no setter (read-only, computed) excluded from DTO→DB check
- `Query<dynamic>` Dapper calls flagged INFO only (can't type-check)
- Test files excluded from scan
- SP result column reads (`myValues("X")`) validated against ALL top-level SELECT blocks in SP body, not just the last — multi-result-set SPs (common in payment flows) don't produce false CRITICALs
- `@UserID`/`@UserKey` DataBroker framework params: suppressed from CRITICAL when SP doesn't declare them (not a code error); automatically added to cs_params to suppress WARNINGs
- OUTPUT params (`@IsValid`, `@CurrentBalance` declared `OUTPUT` in SP) excluded from WARNING "code omits required INPUT param" check
- Optional INPUT params with `DEFAULT` values on SP side excluded from WARNING check

## Auto-fix rules (safe, no migration needed)

| Issue | Fix |
|---|---|
| Positional `reader.GetString(N)` | Replace with `reader.GetString(reader.GetOrdinal("ColumnName"))` — requires human to confirm column name from context |
| Column name string literal mismatch | Edit the string literal in-place (e.g., `"UpdatedAt"` → `"ModifiedDate"`) |
| Vue `*Id:` payload without null coercion | Add `|| null` before the field value |
| TS interface field `string` for nullable Guid | Change to `string | null` |

## Migration-script issues (requires ALTER TABLE / CREATE TABLE)

| Issue | Generated SQL |
|---|---|
| Column referenced in code but missing from DB | `ALTER TABLE dbo.X ADD ColumnName NVARCHAR(500) NULL;` |
| Table referenced in code but absent from schema | `CREATE TABLE dbo.X (...);` skeleton |

## Relationship to /sp-audit

`/sp-audit` runs `sp-audit.py` which focuses specifically on SP parameter drift
(C# AddWithValue ↔ SP declaration). `/code-review-data-tiers` is broader — it
also covers raw SQL column names, reader ordinals, DTO alignment, and the TS/Vue
layer. Run both for full coverage. The data-tier audit will invoke sp-audit
internally and incorporate those results.

## FireProof audit results (2026-04-30 — live DB, 60 tables, 222 SPs)

**Script result after fixes applied:**
- 24 CRITICAL (all pre-launch Customer Portal — not yet deployed)
- 42 WARNING (positional ordinals, SP omissions, Vue empty-ID)
- 1 INFO (DTO drift)

**Fixed this session (8 production bugs):**
- CRITICAL: `usp_Extinguisher_GetByBarcode` — C# sent `@BarcodeData`, SP uses `@Barcode` → fixed ExtinguisherService.cs
- CRITICAL: `usp_Schedule_AutoAssign` — extra `@TenantId` param removed from SchedulingService.cs
- CRITICAL: `usp_Schedule_GetAvailableInspectors` — extra `@InspectionTypeId` removed
- CRITICAL: `usp_TenantBranding_Upsert` — 9 missing params → script 097 ALTER SP
- CRITICAL: `usp_Inspection_GetById` — missing `@TenantId` (security gap) → script 098
- CRITICAL: `usp_FieldMappingTemplate_Save` — missing `@MappingTemplateId` upsert + `@UserId` DEFAULT → script 098
- CRITICAL: NotificationService raw SQL — `l.Name`, `l.Address`, `et.Name`, `it.Name`, `Deficiencies` table, `d.Priority` (6 mismatches)
- CRITICAL: ExtinguisherLifecycleService reader — `"Barcode"` → `"BarcodeData"`, `"Address"` → `"AddressLine1"`

**Pre-launch Customer Portal (tracked, not yet deployed):**
- CustomerUserLocations missing permission columns (CanPerformInspections, CanViewReports, CanManageReminders, GrantedAt, IsActive)
- CustomerUser SPs missing params (CompanyName, PhoneNumber, CreatedByUserId)
- CustomerInspection SPs not yet updated for new schema
- CustomerChecklistResults table doesn't exist yet

**Script false-positive suppressions added:**
- HTML/email template strings excluded from raw SQL extraction
- SQL system catalog names excluded from table existence checks (`sys`, `procedures`, `schemas`, etc.)
- Computed SP aliases excluded: InspectionsDueThisMonth, OverdueInspections, ActiveServiceRequests, etc.

## U-Rent audit results (2026-04-30 — TypeORM entities, no live DB, 48 tables)

**Final state after false-positive tuning:**
- 4 CRITICAL (likely real)
- 2 WARNING (confirmed real)

**False positives eliminated (91 → 6 total):**
- 70 WARNING `@Column() missing name=` on single-word lowercase cols (`status`, `title`) — fixed: only warn when camelCase→snake_case differs
- `id`/`createdAt`/`updatedAt` flagged as unknown — fixed: `@PrimaryGeneratedColumn`, `@CreateDateColumn`, `@UpdateDateColumn` registered in entity parser
- ALL_CAPS enum values (`LAUNCH`, `EARLY_EXPANSION`) flagged as column reads — fixed: skip when `col_name == col_name.upper() and len > 2`
- `funded`/`established` table false positives — English prose in VALUES strings (`'Heavy competition from funded players'`) parsed as `FROM funded` — fixed: strip `'[^']*'` literals before table existence scan
- `backend=unknown` → dotnet DTO miner scanning `.cs` files in a NestJS repo — fixed: `--typeorm` flag forces `backend=nodejs`

**Remaining findings (need investigation):**
- CRITICAL: `admin.service.ts:456,810` — `.where('u.kyc_status = :v')` — `kyc_status` not in User entity (entity uses `@Column({ name: 'kyc_status' })` on `kycStatus` property; QB condition references directly correct but entity parser may have missed it)
- CRITICAL: `voice-search.service.ts:68` — `item.latitude` / `item.longitude` — columns not in items entity (location stored as PostGIS `geography` type — these columns likely do not exist; real bug)
- WARNING: `items.service.ts:606` — positional ordinal read (confirmed real)
- WARNING: `page.tsx:378` — `rulingDisputeId` initialized to `''` without `?? null` coercion (confirmed real)

## PaymentAPI audit results (2026-05-01 — live DB TEST_ECOMMERCE_Windermere, 1814 tables, 4090 SPs)

**Script improvements made this session (all apply to VB.NET DataBroker projects):**
- Fixed Phase 2F regex `[\w.]*\.?(\w+)` → `(?:\w+\.)*(\w+)` — was only capturing last char of table-aliased columns like `SPT.IsActive`, giving 0 INFO; now finds 1129 filter gates → 573 flagged
- Fixed `_trim_select_to_from` identifier collision — `re.match(r'\bFROM\b', text[i:])` matched `FROM` in `@AT_From`, cutting SELECT alias list at position 4; check preceding char now
- `extract_sp_result_columns` now scans **all** depth-0 SELECT blocks (not just last) — payment SPs return 2-3 result sets; first result set aliases were missed
- Added T-SQL `Alias = expression` style to alias extraction (in addition to `expr AS Alias`)
- `sys.parameters.is_output` split: OUTPUT params (`@IsValid OUT`) excluded from WARNING check
- `sys.parameters.has_default_value` split: params with SP-side DEFAULT excluded from WARNING
- DataBroker `SqlParameterList(userId, userKey)` implicit injection: `@UserID`/`@UserKey` added to cs_params for every VB SP call; CRITICAL suppressed for SPs that don't declare them

**Audit result progression:**

| Run | CRITICAL | WARNING | INFO |
|-----|----------|---------|------|
| Initial (trailing-space fix only) | 113 | 866 | 0 |
| +OUTPUT param split | 107 | 823 | 0 |
| +all-SELECT extraction + FROM-in-identifier fix | 54 | 823 | 0 |
| +Phase 2F regex fix | 54 | 823 | 573 |
| +userId/userKey DataBroker injection | **51** | **207** | **573** |

**Confirmed real bugs found (SP param name mismatches):**
- `SelectProductTypeList2`: code sends `@IncludeInactive`, SP has `@IncludeInvalid`
- `Ecommerce_UpdateGuest`: sends `@postalcodeextension_delivery`/`@phonenumber_auxiliary_delivery` — SP params differ
- `Badge_SetupNewBadge`: sends `@replacebadgeid` — not in SP
- `SelectProductTypeList`: sends `@walletid`/`@locationid`/`@restricttoproducttypeglobalkey` — SP only has `@SalonID`/`@UserID`/`@UserKey`
- `SelectProductListForAdmin3_Ecommerce`: sends `@categoryids` — not in SP
- `Transact_RedeemFromAccountToReceiver`: sends `@receiver`, SP has `@ReceiverID`
- `V_Guest`: sends `@ticketid_p`, SP has `@GuestID_P`
- `TPR_MarkAsUploaded`: sends 6 params not in SP (`@completesubmit`/`@studentid`/`@ishazmat`/`@isroad`/`@isrange`/`@istheory`)

**Missing table (CRITICAL — `PendingPaymentRequestDataAccess.vb`):**
- `PendingPaymentRequest` table doesn't exist in `TEST_ECOMMERCE_Windermere`
- 10 columns read: `PendingPaymentRequestID`, `RequestToken`, `RequestData`, `CartItems`, `GuestInfo`, `ReturnUrls`, `CallbackUrl`, `PaymentUrl`, `ExpiresDate`, `ModifiedBy`
- Needs `CREATE TABLE dbo.PendingPaymentRequest (...)` migration

**Remaining false positives in 51 CRITICALs (confirmed):**
- `MessageString` at `EcommerceDataAccess.vb:616` — inside explicit `Try/Catch` with "Some fields might not be available" comment; intentional soft read
- `WPTransactionID`/`ShowDateRange`/`DateRangePrompt`/`RequiresDateRange` etc. — columns from SVDB-specific SP versions not present in TEST_ECOMMERCE staging schema
