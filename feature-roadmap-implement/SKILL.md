---
name: feature-roadmap-implement
description: Works through the issues created by /feature-roadmap, implementing each one with full TDD — tests first, then backend (DB script + SP + Service + Controller), then frontend (composable + views + Vitest specs) — following the dependency graph and sprint order in the consolidated ROADMAP. Opens one PR per issue. Marks the roadmap item complete after the PR is opened. Run after /feature-roadmap has created issues and written the consolidated roadmap.
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - Agent
---

# feature-roadmap-implement

Implements the issues produced by `/feature-roadmap` in dependency order, one at a time, using full TDD. Tests are written before the implementation code. Every feature gets a complete backend + frontend + test suite in a single PR.

## Trigger Phrases

- `/feature-roadmap-implement`
- "implement the roadmap features"
- "work through the roadmap issues"
- "start building the sprint features"
- "implement next roadmap issue"
- "TDD the roadmap"

## Arguments (optional)

- `--issue [N]` — implement a specific GitHub issue number instead of auto-selecting
- `--tier [now|next]` — restrict to features in a specific tier (default: now first, then next)
- `--dry-run` — plan the implementation and write tests, but do not open a PR or push
- `--skip [N,N,N]` — comma-separated issue numbers to skip this session

---

## Instructions

<command-name>feature-roadmap-implement</command-name>

---

### Phase 0: Load all context (parallel)

Run everything in parallel before writing a single line of code.

**0A — Find the authoritative roadmap:**
```bash
ls -t docs/ROADMAP-*.md 2>/dev/null | head -1
```
Read it in full. Extract:
- Sprint execution order (Now tier → Next tier; dependency graph)
- All implementation plans with their task checklists
- GitHub issue numbers for each feature
- Dependency constraints (what must ship before what)

**0B — Find open issues from /feature-roadmap:**
```bash
gh issue list --repo <owner>/<repo> --state open \
  --json number,title,body,labels --limit 50 \
  | python3 -c "
import json, sys
issues = json.load(sys.stdin)
for i in issues:
  labels = [l['name'] for l in i['labels']]
  print(f'#{i[\"number\"]} [{\" \".join(labels)}]: {i[\"title\"]}')
"
```

**0C — Find open PRs (dedup — skip issues already in-flight):**
```bash
gh pr list --state open --json number,title,headRefName,body --limit 50 \
  | python3 -c "
import json, sys
prs = json.load(sys.stdin)
for p in prs:
  print(f'PR #{p[\"number\"]} [{p[\"headRefName\"]}]: {p[\"title\"]}')
"
```

**0D — Read CLAUDE.md and project conventions:**
```bash
cat CLAUDE.md
# Also read the project-specific guardrails if present
ls docs/DEPLOYMENT_GUIDE.md docs/CODE_REVIEW_*.md 2>/dev/null | head -3
```

**0E — Get current test baseline:**
```bash
# Frontend
cd frontend/fire-extinguisher-web && npx vitest run 2>&1 | tail -5

# Backend  
cd backend/FireExtinguisherInspection.API && dotnet build 2>&1 | tail -5
cd backend && dotnet test --no-build 2>&1 | tail -5
```

Record: total Vitest passing, total .NET passing, any compile errors before touching code.

**0F — Read most recent database scripts (to know next script number):**
```bash
ls database/scripts/*.sql | sort | tail -5
```

---

### Phase 1: Select the next issue to implement

Apply the dependency graph from the roadmap to find the next implementable issue.

**Selection algorithm:**
1. Start with Now-tier issues (score ≥18), then Next-tier
2. Within a tier, respect dependency order (no feature before its prerequisites)
3. Skip any issue that has:
   - An open PR referencing it (`gh pr list --search "closes #N"` or branch matching issue title)
   - Already been merged (check `gh issue view N` — if closed with a merge reference)
   - `--skip` flag from user
4. Prefer issues with no dependencies or whose dependencies are already merged

**Dependency check:**
```bash
# Is the dependency issue already closed/merged?
gh issue view <dep-issue-number> --json state,stateReason \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['state'], d.get('stateReason',''))"

# Does a PR already exist for this issue?
gh pr list --search "closes #<issue-number>" --json number,state \
  | python3 -c "import json,sys; prs=json.load(sys.stdin); print('EXISTS:', prs)"
```

**If blocked (all Now-tier issues have unmet dependencies):**
- Select the Next-tier issue with fewest unmet dependencies
- Report which Now-tier items are blocked and what they need

**When the issue is selected, read its full body:**
```bash
gh issue view <number> --json number,title,body,labels
```

Extract from the issue:
- What to build (concrete description)
- Backend tasks (SP names, controller endpoints, service methods)
- Frontend tasks (composable name, view files, integration points)
- Acceptance criteria (these become the test assertions)
- Estimate (SP count)
- Dependencies

---

### Phase 2: Deep-read the existing codebase

Before writing any code, understand the patterns used in adjacent modules.

**2A — Find the most similar existing feature for reference:**
```bash
# If building a service, find a similar service
ls backend/FireExtinguisherInspection.API/Services/ | head -20

# If building a controller, find a similar controller
ls backend/FireExtinguisherInspection.API/Controllers/ | head -20

# If building a Vue composable, find a similar one
ls frontend/fire-extinguisher-web/src/composables/ | head -20

# If building a Vue view, find a similar view
ls frontend/fire-extinguisher-web/src/views/ | head -20
```

Read 2–3 of the most analogous files in full to internalize the pattern. For example:
- New `RepairProposalService.cs` → read `DeficiencyService.cs` + `ScheduledReportService.cs`
- New `useRepairProposals.ts` → read `useDeficiencies.ts` + `useScheduledReports.ts`
- New Vue view → read `DeficienciesView.vue` + the relevant composable it uses

**2B — Read the existing DB script patterns:**
```bash
# Read the most recent script for CREATE OR ALTER PROCEDURE pattern
cat database/scripts/$(ls database/scripts/*.sql | sort | tail -1)
# Also read the most recent script that added a new table
grep -l "CREATE TABLE" database/scripts/*.sql | tail -3
```

**2C — Read the existing test patterns:**
```bash
# Vitest spec closest to the feature being built
ls frontend/fire-extinguisher-web/src/composables/__tests__/*.spec.ts | tail -5
ls frontend/fire-extinguisher-web/src/views/__tests__/*.spec.ts | tail -5

# .NET test closest to the feature being built
ls backend/tests/unit/FireExtinguisherInspection.Tests/**/*.cs | tail -10
```

Read the most relevant spec files in full — you will replicate their import patterns, mock structure, and describe/it organization exactly.

---

### Phase 3: Write the DB migration script (TDD step 1)

The migration script defines the contract that all tests and code will validate against.
Write it before any C# or TypeScript.

**Script naming:** `database/scripts/<next-number>_<Description>.sql`

**Standard script structure for a new table:**
```sql
-- ============================================================
-- Script NNN: <FeatureName>
-- Description: <what this adds>
-- ============================================================

-- ============================================================
-- 1. Table creation
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID(N'dbo.<TableName>') AND type = N'U')
BEGIN
    CREATE TABLE dbo.<TableName> (
        Id              UNIQUEIDENTIFIER    NOT NULL DEFAULT NEWSEQUENTIALID(),
        TenantId        UNIQUEIDENTIFIER    NOT NULL,
        -- ... feature-specific columns ...
        CreatedAt       DATETIME2           NOT NULL DEFAULT GETUTCDATE(),
        UpdatedAt       DATETIME2           NOT NULL DEFAULT GETUTCDATE(),
        CONSTRAINT PK_<TableName> PRIMARY KEY CLUSTERED (Id),
        CONSTRAINT FK_<TableName>_Tenants FOREIGN KEY (TenantId) REFERENCES dbo.Tenants(Id)
    );
    CREATE INDEX IX_<TableName>_TenantId ON dbo.<TableName> (TenantId);
    PRINT 'Created dbo.<TableName>';
END
GO

-- ============================================================
-- 2. Stored procedures (CREATE OR ALTER — idempotent)
-- ============================================================

CREATE OR ALTER PROCEDURE dbo.usp_<Entity>_Create
    @TenantId   UNIQUEIDENTIFIER,
    @<Field1>   <Type>,
    @<Field2>   <Type>
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Id UNIQUEIDENTIFIER = NEWSEQUENTIALID();
    
    INSERT INTO dbo.<TableName> (Id, TenantId, <Field1>, <Field2>)
    VALUES (@Id, @TenantId, @<Field1>, @<Field2>);
    
    SELECT Id, TenantId, <Field1>, <Field2>, CreatedAt, UpdatedAt
    FROM dbo.<TableName>
    WHERE Id = @Id;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_<Entity>_GetById
    @Id         UNIQUEIDENTIFIER,
    @TenantId   UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    SELECT Id, TenantId, <Field1>, <Field2>, CreatedAt, UpdatedAt
    FROM dbo.<TableName>
    WHERE Id = @Id AND TenantId = @TenantId;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_<Entity>_GetAll
    @TenantId   UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    SELECT Id, TenantId, <Field1>, <Field2>, CreatedAt, UpdatedAt
    FROM dbo.<TableName>
    WHERE TenantId = @TenantId
    ORDER BY CreatedAt DESC;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_<Entity>_Update
    @Id         UNIQUEIDENTIFIER,
    @TenantId   UNIQUEIDENTIFIER,
    @<Field1>   <Type>,
    @<Field2>   <Type>
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE dbo.<TableName>
    SET <Field1> = @<Field1>,
        <Field2> = @<Field2>,
        UpdatedAt = GETUTCDATE()
    WHERE Id = @Id AND TenantId = @TenantId;
    
    IF @@ROWCOUNT = 0
        THROW 50404, 'Record not found or access denied.', 1;
    
    SELECT Id, TenantId, <Field1>, <Field2>, CreatedAt, UpdatedAt
    FROM dbo.<TableName>
    WHERE Id = @Id AND TenantId = @TenantId;
END
GO

CREATE OR ALTER PROCEDURE dbo.usp_<Entity>_Delete
    @Id         UNIQUEIDENTIFIER,
    @TenantId   UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    DELETE FROM dbo.<TableName>
    WHERE Id = @Id AND TenantId = @TenantId;
    
    IF @@ROWCOUNT = 0
        THROW 50404, 'Record not found or access denied.', 1;
END
GO

PRINT 'Script NNN complete.';
```

**Critical rules for every script:**
- `CREATE OR ALTER PROCEDURE` — never `DROP` then `CREATE` (breaks in-use SPs)
- Every SP that reads or writes tenant data: `AND TenantId = @TenantId` in WHERE
- Every table: `TenantId UNIQUEIDENTIFIER NOT NULL` with FK to `dbo.Tenants`
- Every table: index on `TenantId` for query performance
- `NEWSEQUENTIALID()` not `NEWID()` for PKs (sequential is clustered-index friendly)
- `DATETIME2` not `DATETIME`
- `THROW 50404` pattern for not-found (ErrorHandlingMiddleware catches)

**For ALTER TABLE scripts (adding columns to existing tables):**
```sql
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.<Table>') AND name = '<Column>')
BEGIN
    ALTER TABLE dbo.<Table> ADD <Column> <Type> <NULL|NOT NULL> <DEFAULT>;
    PRINT 'Added <Column> to dbo.<Table>';
END
GO
```

---

### Phase 4: Write backend tests FIRST (TDD step 2)

**Before writing any service or controller code**, write the test file.
Tests define the contract; implementation satisfies it.

**4A — Locate the test project:**
```bash
ls backend/tests/unit/FireExtinguisherInspection.Tests/
# Pattern: Services/<FeatureName>ServiceTests.cs
```

**4B — Write `<FeatureName>ServiceTests.cs`:**

Model on the existing test structure. Key patterns for FireProof .NET tests:

```csharp
using FireExtinguisherInspection.API.Services;
using FireExtinguisherInspection.API.DTOs;
using FireExtinguisherInspection.API.Exceptions;
using FireExtinguisherInspection.API.Data;
using Moq;
using Xunit;
using System.Data;

namespace FireExtinguisherInspection.Tests.Services;

public class <FeatureName>ServiceTests
{
    private readonly Mock<IDbConnectionFactory> _mockDb;
    private readonly Mock<IDbConnection> _mockConn;
    private readonly <FeatureName>Service _service;

    public <FeatureName>ServiceTests()
    {
        _mockDb = new Mock<IDbConnectionFactory>();
        _mockConn = new Mock<IDbConnection>();
        _mockDb.Setup(x => x.CreateConnection()).Returns(_mockConn.Object);
        _service = new <FeatureName>Service(_mockDb.Object);
    }

    [Fact]
    public async Task Create_ValidRequest_ReturnsDto()
    {
        // Arrange
        var tenantId = Guid.NewGuid();
        var request = new Create<FeatureName>Request { /* ... */ };
        var expected = new <FeatureName>Dto { Id = Guid.NewGuid(), TenantId = tenantId, /* ... */ };
        
        _mockConn.SetupDapper("usp_<Entity>_Create", expected);
        
        // Act
        var result = await _service.CreateAsync(tenantId, request);
        
        // Assert
        Assert.Equal(expected.Id, result.Id);
        Assert.Equal(tenantId, result.TenantId);
    }

    [Fact]
    public async Task GetById_NotFound_ThrowsNotFoundException()
    {
        // Arrange
        _mockConn.SetupDapper<<FeatureName>Dto>("usp_<Entity>_GetById", null);
        
        // Act & Assert
        await Assert.ThrowsAsync<NotFoundException>(
            () => _service.GetByIdAsync(Guid.NewGuid(), Guid.NewGuid())
        );
    }

    [Fact]
    public async Task GetAll_ValidTenant_ReturnsList()
    {
        // Arrange
        var tenantId = Guid.NewGuid();
        var expected = new List<<FeatureName>Dto> { new() { TenantId = tenantId } };
        _mockConn.SetupDapper("usp_<Entity>_GetAll", expected);
        
        // Act
        var result = await _service.GetAllAsync(tenantId);
        
        // Assert
        Assert.Single(result);
    }

    [Fact]
    public async Task Update_NotFound_ThrowsNotFoundException()
    {
        _mockConn.SetupDapper<<FeatureName>Dto>("usp_<Entity>_Update", null);
        await Assert.ThrowsAsync<NotFoundException>(
            () => _service.UpdateAsync(Guid.NewGuid(), Guid.NewGuid(), new Update<FeatureName>Request())
        );
    }

    [Fact]
    public async Task Delete_NotFound_ThrowsNotFoundException()
    {
        _mockConn.SetupDapper("usp_<Entity>_Delete", 0); // 0 rows affected
        await Assert.ThrowsAsync<NotFoundException>(
            () => _service.DeleteAsync(Guid.NewGuid(), Guid.NewGuid())
        );
    }
}
```

Write a minimum of 5 test cases per service:
1. Happy path Create
2. GetById not found → NotFoundException
3. GetAll returns list
4. Update not found → NotFoundException
5. Delete not found → NotFoundException
6. (If applicable) domain validation → ValidationException
7. (If applicable) duplicate → ConflictException

**After writing tests, confirm they FAIL (red) before writing the implementation:**
```bash
cd backend && dotnet test --filter "FullyQualifiedName~<FeatureName>ServiceTests" 2>&1 | tail -10
```
Expected: compile errors or test failures — this proves the tests are real.

---

### Phase 5: Implement the backend (TDD step 3 — make tests green)

Implement in this order, compiling after each file:

**5A — DTOs: `backend/FireExtinguisherInspection.API/DTOs/<FeatureName>Dto.cs`**

```csharp
namespace FireExtinguisherInspection.API.DTOs;

public class <FeatureName>Dto
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    // ... feature fields ...
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public class Create<FeatureName>Request
{
    // required fields only — TenantId comes from JWT, never from request body
    public string <Field1> { get; set; } = string.Empty;
    public decimal? <Field2> { get; set; }
}

public class Update<FeatureName>Request
{
    public string <Field1> { get; set; } = string.Empty;
    public decimal? <Field2> { get; set; }
}
```

**5B — Service: `backend/FireExtinguisherInspection.API/Services/<FeatureName>Service.cs`**

```csharp
using Dapper;
using FireExtinguisherInspection.API.Data;
using FireExtinguisherInspection.API.DTOs;
using FireExtinguisherInspection.API.Exceptions;

namespace FireExtinguisherInspection.API.Services;

public interface I<FeatureName>Service
{
    Task<<FeatureName>Dto> CreateAsync(Guid tenantId, Create<FeatureName>Request request);
    Task<<FeatureName>Dto> GetByIdAsync(Guid id, Guid tenantId);
    Task<IEnumerable<<FeatureName>Dto>> GetAllAsync(Guid tenantId);
    Task<<FeatureName>Dto> UpdateAsync(Guid id, Guid tenantId, Update<FeatureName>Request request);
    Task DeleteAsync(Guid id, Guid tenantId);
}

public class <FeatureName>Service : I<FeatureName>Service
{
    private readonly IDbConnectionFactory _db;

    public <FeatureName>Service(IDbConnectionFactory db) => _db = db;

    public async Task<<FeatureName>Dto> CreateAsync(Guid tenantId, Create<FeatureName>Request request)
    {
        using var conn = _db.CreateConnection();
        return await conn.QuerySingleAsync<<FeatureName>Dto>(
            "usp_<Entity>_Create",
            new { TenantId = tenantId, request.<Field1>, request.<Field2> },
            commandType: System.Data.CommandType.StoredProcedure
        );
    }

    public async Task<<FeatureName>Dto> GetByIdAsync(Guid id, Guid tenantId)
    {
        using var conn = _db.CreateConnection();
        var result = await conn.QuerySingleOrDefaultAsync<<FeatureName>Dto>(
            "usp_<Entity>_GetById",
            new { Id = id, TenantId = tenantId },
            commandType: System.Data.CommandType.StoredProcedure
        );
        return result ?? throw new NotFoundException($"<FeatureName> {id} not found.");
    }

    public async Task<IEnumerable<<FeatureName>Dto>> GetAllAsync(Guid tenantId)
    {
        using var conn = _db.CreateConnection();
        return await conn.QueryAsync<<FeatureName>Dto>(
            "usp_<Entity>_GetAll",
            new { TenantId = tenantId },
            commandType: System.Data.CommandType.StoredProcedure
        );
    }

    public async Task<<FeatureName>Dto> UpdateAsync(Guid id, Guid tenantId, Update<FeatureName>Request request)
    {
        using var conn = _db.CreateConnection();
        var result = await conn.QuerySingleOrDefaultAsync<<FeatureName>Dto>(
            "usp_<Entity>_Update",
            new { Id = id, TenantId = tenantId, request.<Field1>, request.<Field2> },
            commandType: System.Data.CommandType.StoredProcedure
        );
        return result ?? throw new NotFoundException($"<FeatureName> {id} not found.");
    }

    public async Task DeleteAsync(Guid id, Guid tenantId)
    {
        using var conn = _db.CreateConnection();
        var rows = await conn.ExecuteAsync(
            "usp_<Entity>_Delete",
            new { Id = id, TenantId = tenantId },
            commandType: System.Data.CommandType.StoredProcedure
        );
        if (rows == 0) throw new NotFoundException($"<FeatureName> {id} not found.");
    }
}
```

**5C — Controller: `backend/FireExtinguisherInspection.API/Controllers/<FeatureName>Controller.cs`**

```csharp
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using FireExtinguisherInspection.API.Services;
using FireExtinguisherInspection.API.DTOs;
using FireExtinguisherInspection.API.Extensions;

namespace FireExtinguisherInspection.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class <FeatureName>Controller : ControllerBase
{
    private readonly I<FeatureName>Service _service;

    public <FeatureName>Controller(I<FeatureName>Service service) => _service = service;

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var tenantId = User.GetTenantId();
        var results = await _service.GetAllAsync(tenantId);
        return Ok(results);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var tenantId = User.GetTenantId();
        var result = await _service.GetByIdAsync(id, tenantId);
        return Ok(result);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] Create<FeatureName>Request request)
    {
        var tenantId = User.GetTenantId();
        var result = await _service.CreateAsync(tenantId, request);
        return CreatedAtAction(nameof(GetById), new { id = result.Id }, result);
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] Update<FeatureName>Request request)
    {
        var tenantId = User.GetTenantId();
        var result = await _service.UpdateAsync(id, tenantId, request);
        return Ok(result);
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var tenantId = User.GetTenantId();
        await _service.DeleteAsync(id, tenantId);
        return NoContent();
    }
}
```

**5D — Register in `Program.cs`:**
```csharp
builder.Services.AddScoped<I<FeatureName>Service, <FeatureName>Service>();
```

**5E — Compile and run backend tests (make them green):**
```bash
cd backend/FireExtinguisherInspection.API && dotnet build 2>&1 | grep -E "error|warning" | head -20
cd backend && dotnet test --filter "FullyQualifiedName~<FeatureName>ServiceTests" 2>&1 | tail -15
```

Iterate until all backend tests pass. Do not proceed to frontend until backend tests are green.

---

### Phase 6: Write Vitest specs FIRST (TDD step 4)

**Before writing any Vue composable or component**, write the spec files.

**6A — Composable spec: `frontend/fire-extinguisher-web/src/composables/__tests__/use<FeatureName>.spec.ts`**

```typescript
// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.hoisted MUST be used when mock vars are referenced inside vi.mock factories
const { mockGet, mockPost, mockPut, mockDelete } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
  mockPut: vi.fn(),
  mockDelete: vi.fn()
}))

vi.mock('../../services/api', () => ({
  default: {
    get: mockGet,
    post: mockPost,
    put: mockPut,
    delete: mockDelete
  }
}))

import { use<FeatureName> } from '../use<FeatureName>'

const TENANT_ID = '00000000-0000-0000-0000-000000000001'

const make<FeatureName> = (overrides = {}) => ({
  id: '00000000-0000-0000-0000-000000000002',
  tenantId: TENANT_ID,
  // ... feature fields with sensible defaults ...
  createdAt: '2026-05-05T00:00:00Z',
  updatedAt: '2026-05-05T00:00:00Z',
  ...overrides
})

describe('use<FeatureName>', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('fetchAll', () => {
    it('returns list on success', async () => {
      const items = [make<FeatureName>(), make<FeatureName>({ id: '00000000-0000-0000-0000-000000000003' })]
      mockGet.mockResolvedValue({ data: items })
      
      const { fetchAll, items: result } = use<FeatureName>()
      await fetchAll()
      
      expect(mockGet).toHaveBeenCalledWith('/api/<feature-name>')
      expect(result.value).toHaveLength(2)
    })

    it('sets error on failure', async () => {
      mockGet.mockRejectedValue(new Error('Network error'))
      const { fetchAll, error } = use<FeatureName>()
      await fetchAll()
      expect(error.value).toBeTruthy()
    })
  })

  describe('create', () => {
    it('adds new item to list on success', async () => {
      const newItem = make<FeatureName>()
      mockPost.mockResolvedValue({ data: newItem })
      
      const { create, items } = use<FeatureName>()
      await create({ /* request fields */ })
      
      expect(mockPost).toHaveBeenCalledWith('/api/<feature-name>', expect.any(Object))
      expect(items.value).toContainEqual(expect.objectContaining({ id: newItem.id }))
    })

    it('sets error on conflict (409)', async () => {
      const err = { response: { status: 409 } }
      mockPost.mockRejectedValue(err)
      
      const { create, error } = use<FeatureName>()
      await create({})
      
      expect(error.value).toBeTruthy()
    })
  })

  describe('update', () => {
    it('replaces item in list after successful update', async () => {
      const original = make<FeatureName>()
      const updated = { ...original, /* changed field */ }
      mockGet.mockResolvedValue({ data: [original] })
      mockPut.mockResolvedValue({ data: updated })
      
      const { fetchAll, update, items } = use<FeatureName>()
      await fetchAll()
      await update(original.id, {})
      
      expect(items.value[0]).toMatchObject(updated)
    })
  })

  describe('remove', () => {
    it('removes item from list after delete', async () => {
      const item = make<FeatureName>()
      mockGet.mockResolvedValue({ data: [item] })
      mockDelete.mockResolvedValue({})
      
      const { fetchAll, remove, items } = use<FeatureName>()
      await fetchAll()
      await remove(item.id)
      
      expect(items.value).toHaveLength(0)
    })
  })

  describe('loading state', () => {
    it('isLoading is true during fetch, false after', async () => {
      let resolveGet!: (v: unknown) => void
      mockGet.mockReturnValue(new Promise(r => { resolveGet = r }))
      
      const { fetchAll, isLoading } = use<FeatureName>()
      const fetchPromise = fetchAll()
      
      expect(isLoading.value).toBe(true)
      resolveGet({ data: [] })
      await fetchPromise
      expect(isLoading.value).toBe(false)
    })
  })
})
```

**6B — View spec (for the primary admin or inspector view):**

```typescript
// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'

// vi.hoisted for mocks that composable needs
const { mockFetchAll, mockCreate, mockUpdate, mockRemove } = vi.hoisted(() => ({
  mockFetchAll: vi.fn().mockResolvedValue(undefined),
  mockCreate: vi.fn().mockResolvedValue(undefined),
  mockUpdate: vi.fn().mockResolvedValue(undefined),
  mockRemove: vi.fn().mockResolvedValue(undefined)
}))

const mockItems = ref([])
const mockIsLoading = ref(false)
const mockError = ref<string | null>(null)

vi.mock('../../composables/use<FeatureName>', () => ({
  use<FeatureName>: () => ({
    items: mockItems,
    isLoading: mockIsLoading,
    error: mockError,
    fetchAll: mockFetchAll,
    create: mockCreate,
    update: mockUpdate,
    remove: mockRemove
  })
}))

import { ref } from 'vue'
import <FeatureName>View from '../<FeatureName>View.vue'

const mountView = () => mount(<FeatureName>View, {
  global: {
    plugins: [createTestingPinia({ createSpy: vi.fn })],
    stubs: { teleport: true }
  }
})

describe('<FeatureName>View', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockItems.value = []
    mockIsLoading.value = false
    mockError.value = null
  })

  it('calls fetchAll on mount', async () => {
    mountView()
    expect(mockFetchAll).toHaveBeenCalledOnce()
  })

  it('shows loading state', async () => {
    mockIsLoading.value = true
    const wrapper = mountView()
    // Adjust selector to match actual loading indicator in the view
    expect(wrapper.find('[data-testid="loading"]').exists()).toBe(true)
  })

  it('renders items when loaded', async () => {
    mockItems.value = [{ id: '1', /* fields */ }]
    const wrapper = mountView()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="<feature>-list"]').exists()).toBe(true)
  })

  it('opens create modal on button click', async () => {
    const wrapper = mountView()
    await wrapper.find('[data-testid="create-<feature>-btn"]').trigger('click')
    expect(wrapper.find('[data-testid="<feature>-modal"]').exists()).toBe(true)
  })

  it('calls create with form data on submit', async () => {
    const wrapper = mountView()
    await wrapper.find('[data-testid="create-<feature>-btn"]').trigger('click')
    // Fill form and submit
    await wrapper.find('[data-testid="<feature>-modal-submit"]').trigger('click')
    expect(mockCreate).toHaveBeenCalled()
  })

  it('shows error message when error is set', async () => {
    mockError.value = 'Something went wrong'
    const wrapper = mountView()
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('Something went wrong')
  })
})
```

**Run specs to confirm they fail (red phase):**
```bash
cd frontend/fire-extinguisher-web && npx vitest run src/composables/__tests__/use<FeatureName>.spec.ts 2>&1 | tail -10
```

---

### Phase 7: Implement the frontend (TDD step 5 — make specs green)

**7A — Service layer: `frontend/fire-extinguisher-web/src/services/<featureName>Service.ts`**

If the project uses a per-feature service file (check existing pattern), write it:

```typescript
import api from './api'
import type { <FeatureName>Dto, Create<FeatureName>Request, Update<FeatureName>Request } from '../types/<featureName>'

const BASE = '/api/<feature-name>'

export const <featureName>Service = {
  getAll: () => api.get<<FeatureName>Dto[]>(BASE),
  getById: (id: string) => api.get<<FeatureName>Dto>(`${BASE}/${id}`),
  create: (data: Create<FeatureName>Request) => api.post<<FeatureName>Dto>(BASE, data),
  update: (id: string, data: Update<FeatureName>Request) => api.put<<FeatureName>Dto>(`${BASE}/${id}`, data),
  remove: (id: string) => api.delete(`${BASE}/${id}`)
}
```

**7B — Composable: `frontend/fire-extinguisher-web/src/composables/use<FeatureName>.ts`**

```typescript
import { ref } from 'vue'
import { <featureName>Service } from '../services/<featureName>Service'
import { useToastStore } from '../stores/toastStore'
import { getApiErrorMessage } from '../utils/captureError'
import type { <FeatureName>Dto, Create<FeatureName>Request, Update<FeatureName>Request } from '../types/<featureName>'

export function use<FeatureName>() {
  const toast = useToastStore()
  const items = ref<<FeatureName>Dto[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  async function fetchAll() {
    isLoading.value = true
    error.value = null
    try {
      const res = await <featureName>Service.getAll()
      items.value = res.data
    } catch (err: unknown) {
      error.value = getApiErrorMessage(err)
    } finally {
      isLoading.value = false
    }
  }

  async function create(data: Create<FeatureName>Request) {
    try {
      const res = await <featureName>Service.create(data)
      items.value.unshift(res.data)
      toast.success('<FeatureName> created successfully')
    } catch (err: unknown) {
      error.value = getApiErrorMessage(err)
      toast.error(error.value)
    }
  }

  async function update(id: string, data: Update<FeatureName>Request) {
    try {
      const res = await <featureName>Service.update(id, data)
      const idx = items.value.findIndex(i => i.id === id)
      if (idx !== -1) items.value[idx] = res.data
      toast.success('<FeatureName> updated')
    } catch (err: unknown) {
      error.value = getApiErrorMessage(err)
      toast.error(error.value)
    }
  }

  async function remove(id: string) {
    try {
      await <featureName>Service.remove(id)
      items.value = items.value.filter(i => i.id !== id)
      toast.success('<FeatureName> deleted')
    } catch (err: unknown) {
      error.value = getApiErrorMessage(err)
      toast.error(error.value)
    }
  }

  return { items, isLoading, error, fetchAll, create, update, remove }
}
```

**Key composable rules (always apply):**
- `useToastStore()` not `alert()` for all user feedback
- `getApiErrorMessage(err)` for error extraction (handles `catch(unknown)`)
- `isLoading` wraps every async operation
- `error` is reset to `null` at the start of each operation
- No direct Axios imports — use the `api` service layer

**7C — Vue View: `frontend/fire-extinguisher-web/src/views/<FeatureName>View.vue`**

```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { use<FeatureName> } from '../composables/use<FeatureName>'
import type { <FeatureName>Dto } from '../types/<featureName>'

const { items, isLoading, error, fetchAll, create, update, remove } = use<FeatureName>()

// Modal state
const showModal = ref(false)
const editingItem = ref<<FeatureName>Dto | null>(null)

function openCreate() {
  editingItem.value = null
  showModal.value = true
}

function openEdit(item: <FeatureName>Dto) {
  editingItem.value = item
  showModal.value = true
}

function closeModal() {
  showModal.value = false
  editingItem.value = null
}

async function handleSubmit(data: Record<string, unknown>) {
  if (editingItem.value) {
    await update(editingItem.value.id, data)
  } else {
    await create(data)
  }
  if (!error.value) closeModal()
}

async function handleDelete(id: string) {
  await remove(id)
}

onMounted(fetchAll)
</script>

<template>
  <div class="<feature-name>-view">
    <div class="view-header">
      <h1><!-- Page title --></h1>
      <button data-testid="create-<feature>-btn" @click="openCreate">
        Add <!-- FeatureName -->
      </button>
    </div>

    <div v-if="isLoading" data-testid="loading" class="loading-state">
      <!-- Loading indicator -->
    </div>

    <div v-else-if="error" class="error-state">
      {{ error }}
    </div>

    <div v-else>
      <div data-testid="<feature>-list">
        <!-- Render items -->
        <div
          v-for="item in items"
          :key="item.id"
          data-testid="<feature>-item"
        >
          <!-- Item content -->
          <button @click="openEdit(item)">Edit</button>
          <button @click="handleDelete(item.id)">Delete</button>
        </div>

        <div v-if="items.length === 0" data-testid="empty-state">
          No <!-- featureName --> yet.
        </div>
      </div>
    </div>

    <!-- Modal -->
    <div v-if="showModal" data-testid="<feature>-modal">
      <!-- Modal content / form -->
      <button data-testid="<feature>-modal-submit" @click="handleSubmit({})">
        {{ editingItem ? 'Update' : 'Create' }}
      </button>
      <button @click="closeModal">Cancel</button>
    </div>
  </div>
</template>
```

**Key Vue rules (always apply):**
- `data-testid` on every interactive element and key display region
- No `alert()` — all user feedback through `useToastStore`
- `v-if="isLoading"` / `v-else-if="error"` / `v-else` pattern for state management
- Empty state always present (`v-if="items.length === 0"`)
- Modal state managed locally with `ref(false)` — never in Pinia for ephemeral UI state
- `onMounted(fetchAll)` always present — no manual call in `setup`

**7D — Run specs (make them green):**
```bash
cd frontend/fire-extinguisher-web && npx vitest run src/composables/__tests__/use<FeatureName>.spec.ts 2>&1 | tail -15
npx vitest run src/views/__tests__/<FeatureName>View.spec.ts 2>&1 | tail -15
```

Iterate until all specs pass. Fix implementation — not the tests.

---

### Phase 8: Run the full test suite

```bash
# Frontend — all tests must still pass
cd frontend/fire-extinguisher-web && npx vitest run 2>&1 | tail -10

# Backend — compile + test
cd backend/FireExtinguisherInspection.API && dotnet build 2>&1 | grep -E "^.*error" | head -20
cd backend && dotnet test 2>&1 | tail -15
```

**Pass criteria:**
- Vitest: same count as baseline OR higher (never fewer)
- .NET: same count as baseline OR higher
- Zero new compile errors or TS errors

If any pre-existing tests broke:
1. Identify which ones and why
2. Fix the underlying issue (never suppress or skip tests)
3. Re-run to confirm full suite green

**TypeScript check:**
```bash
cd frontend/fire-extinguisher-web && npx tsc --noEmit 2>&1 | grep "error TS" | head -20
```
Must be 0 new TS errors (pre-existing errors are pre-existing — don't introduce new ones).

---

### Phase 9: Create the pull request

**9A — Create a feature branch and commit:**
```bash
BRANCH="feat/<feature-name-kebab>"
git checkout -b "$BRANCH"

# Stage new and modified files
git add database/scripts/<NNN>_<Description>.sql
git add backend/FireExtinguisherInspection.API/DTOs/<FeatureName>Dto.cs
git add backend/FireExtinguisherInspection.API/Services/<FeatureName>Service.cs
git add backend/FireExtinguisherInspection.API/Controllers/<FeatureName>Controller.cs
git add backend/tests/unit/FireExtinguisherInspection.Tests/Services/<FeatureName>ServiceTests.cs
git add frontend/fire-extinguisher-web/src/composables/use<FeatureName>.ts
git add frontend/fire-extinguisher-web/src/composables/__tests__/use<FeatureName>.spec.ts
git add frontend/fire-extinguisher-web/src/views/<FeatureName>View.vue
git add frontend/fire-extinguisher-web/src/views/__tests__/<FeatureName>View.spec.ts

git commit -m "$(cat <<'EOF'
feat(<scope>): <feature description>

Closes #<issue-number>

Backend:
- Script <NNN>: <table/SP description>
- <FeatureName>Service: <methods>
- <FeatureName>Controller: <endpoints>
- <N> .NET tests

Frontend:
- use<FeatureName> composable: fetchAll, create, update, remove
- <FeatureName>View: <description>
- <N> Vitest tests

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"

git push -u origin "$BRANCH"
```

**9B — Open the PR:**
```bash
gh pr create \
  --title "feat(<scope>): <feature description>" \
  --body "$(cat <<'EOF'
## Summary

Implements #<issue-number> — <feature name>

**Competitive signal:** <Why this matters — from FEATURE-ROADMAP>
**Roadmap tier:** Now/Next (score N/25)

## Changes

### Database (script NNN)
- New table: `dbo.<TableName>` (<N> columns, TenantId FK, clustered index)
- New SPs: `usp_<Entity>_Create/GetById/GetAll/Update/Delete`
- <Any additional SPs specific to this feature>

### Backend (.NET 8)
- `<FeatureName>Service.cs` — <N> methods, full TenantId isolation
- `<FeatureName>Controller.cs` — <N> endpoints (`GET/POST/PUT/DELETE /api/<feature>`)
- `<FeatureName>Dto.cs` — request/response types

### Frontend (Vue 3)
- `use<FeatureName>.ts` composable — reactive state, all CRUD operations
- `<FeatureName>View.vue` — admin/inspector view with list, create, edit, delete
- Toast notifications via `useToastStore` throughout

## Test Coverage

| Layer | Before | After | New Tests |
|-------|--------|-------|-----------|
| Vitest | <baseline> | <new count> | +<N> |
| .NET xUnit | <baseline> | <new count> | +<N> |

All tests passing. 0 new TypeScript errors.

## Acceptance Criteria

From issue #<number>:
- [ ] <criterion 1>
- [ ] <criterion 2>
- [ ] <criterion 3>

## Deployment Notes

- **DB script <NNN>** must be applied before API deployment
- Run: `sqlcmd -S sqltest.schoolvision.net,14333 -d FireProofDB ...`
- No breaking changes to existing endpoints

## Screenshots

<!-- Add if UI changes are significant -->

🤖 Generated with [Claude Code](https://claude.ai/claude-code)
EOF
)"
```

---

### Phase 10: Update the roadmap and close tracking

**10A — Mark item complete in the consolidated roadmap:**

Read the current roadmap. Find the feature's task checklist. Change all `- [ ]` to `- [x]` for completed tasks, and add `| PR #NNN` to the feature heading.

```bash
ROADMAP=$(ls -t docs/ROADMAP-*.md | head -1)
# Edit the file to mark tasks complete
# Add: "| PR #NNN opened — awaiting merge"
```

**10B — Commit the roadmap update:**
```bash
git add "$ROADMAP"
git commit -m "docs: mark <FeatureName> complete in roadmap (PR #NNN)"
git push
```

**10C — Comment on the GitHub issue with the PR link:**
```bash
gh issue comment <issue-number> \
  --body "PR #<pr-number> opened implementing this feature.

**What was built:**
- DB script <NNN>: <table + SPs>
- Backend: <FeatureName>Service + Controller
- Frontend: use<FeatureName> composable + <FeatureName>View

**Test coverage:** +<N> Vitest, +<N> .NET xUnit
**Branch:** \`feat/<feature-name>\`"
```

---

### Phase 11: Report to user

```
✅ feature-roadmap-implement — Issue #NNN complete

Feature: <name> (Score: N/25 — Now/Next tier)
PR: #NNN — feat(<scope>): <description>
Branch: feat/<feature-name>

What was built:
  DB:       Script NNN — dbo.<Table> + N SPs
  Backend:  <FeatureName>Service + Controller (N endpoints)
  Frontend: use<FeatureName>.ts + <FeatureName>View.vue

Test delta:
  Vitest:  <before> → <after> (+N new tests)
  .NET:    <before> → <after> (+N new tests)

Roadmap: docs/ROADMAP-<date>.md updated (item marked complete)

Next implementable issue: #NNN — <name> (<tier>)
  (blocked by: <dependency if any>)
  Run /feature-roadmap-implement again to continue.
```

---

## TDD Discipline Rules

These are non-negotiable. The skill enforces TDD strictly.

1. **DB script before any code** — the schema defines the contract everything else validates against
2. **Backend tests before backend code** — tests must fail (red) before implementation begins
3. **Frontend specs before frontend code** — specs must fail (red) before composable/view exists
4. **Never modify a test to make it pass** — fix the implementation instead
5. **Never skip or `vi.skip()` a failing test** — diagnose and fix it
6. **Minimum test counts:**
   - .NET service: 5 test cases per service
   - Vitest composable: 5 test cases (fetchAll, create, update, remove, loading state)
   - Vitest view: 5 test cases (mount, loading, render, open modal, submit)
7. **`data-testid` on every interactive element** — views without testids fail code review
8. **Full suite must pass before PR** — no "tests will be added later"

---

## FireProof-Specific Architecture Rules

These rules apply to every feature built in this project. Never deviate.

### Backend (.NET 8 + Dapper + SQL Server)

- **Stored procedures only** — no raw SQL in C#, no EF Core queries
- **SP naming**: `usp_<Entity>_<Operation>` (e.g., `usp_RepairProposal_Create`)
- **TenantId isolation**: Every SP that reads or writes tenant data uses `AND TenantId = @TenantId`
- **`IDbConnectionFactory`** not `IDbConnection` directly — factory pattern for connection lifecycle
- **Dapper call patterns**:
  - Single row: `QuerySingleOrDefaultAsync<T>` → null means not found → throw `NotFoundException`
  - Multiple rows: `QueryAsync<T>`
  - Command only: `ExecuteAsync` → check `@@ROWCOUNT` in SP or row count return
  - `commandType: CommandType.StoredProcedure` always
- **Exception hierarchy**: `NotFoundException` (→ 404), `ValidationException` (→ 400), `ConflictException` (→ 409) all extend `DomainException` — `ErrorHandlingMiddleware` maps them
- **Never** broad `catch` blocks in controllers — let middleware handle exceptions
- **TenantId from JWT**: Use `User.GetTenantId()` extension — never from request body
- **Role guards**: `[Authorize(Roles = "TenantAdministrator,SystemAdministrator")]` for admin endpoints

### Database (SQL Server)

- `CREATE OR ALTER PROCEDURE` — never `DROP` + `CREATE`
- `NEWSEQUENTIALID()` for all PKs — never `NEWID()` (sequential is clustered-index friendly)
- `DATETIME2` not `DATETIME`
- Guard column adds: `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE ...)`
- Guard table creates: `IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE ...)`
- Every new table: `TenantId FK + index`
- `THROW 50404, 'Not found.', 1` for not-found (middleware catches SQL exceptions with this number)
- Script numbering: monotonically increasing from current max

### Frontend (Vue 3 + Vitest)

- **`useToastStore()`** not `alert()` for all feedback
- **`getApiErrorMessage(err)`** for all `catch (err: unknown)` — in `utils/captureError.ts`
- **`vi.hoisted()`** for mock variables referenced in `vi.mock()` factories — mandatory
- **`@vitest-environment happy-dom`** for any component or composable that touches DOM/localStorage
- **`data-testid`** on every interactive element and key display region
- **Empty state** always handled (`v-if="items.length === 0"`)
- **`isLoading` state** always present in composables, always rendered in views
- **`onMounted(fetchAll)`** — never call fetch manually in `setup` script
- **No `console.log` in production paths** — use `captureError` utilities
- Reactive state: `ref()` for primitives, `ref([])` for lists — not `reactive()`
- Toast patterns:
  - Success: `toast.success('...')`
  - Error: `toast.error('...')`
  - Warning: `toast.warning('...')`

### iOS / Capacitor

- Any new feature using device hardware (camera, NFC, GPS): check `Capacitor.isNativePlatform()` and provide web fallback
- Photo uploads: compress client-side before R2 upload
- Offline-capable features: check `offlineSync.ts` for queue registration pattern

---

## Dependency Resolution

Before implementing an issue, always verify its dependencies are met:

```bash
# Check if a dependency issue is already closed
gh issue view <dep-number> --json state | python3 -c "import json,sys; print(json.load(sys.stdin)['state'])"
# Expect: "CLOSED"

# Check if a dependency PR is merged
gh pr view <pr-number> --json state,mergedAt | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['state'], d.get('mergedAt','not merged'))"
# Expect: "MERGED <timestamp>"
```

If a dependency is NOT yet merged:
1. Do not implement the dependent feature
2. Select the dependency as the next implementation target instead
3. Report clearly: "Implementing #N first because #M depends on it"

The dependency graph from the roadmap defines the correct order. Follow it.

---

## Session Batching

The roadmap specifies PR batching (typically max 3 PRs per session for complex features).
Each invocation of `feature-roadmap-implement` implements exactly ONE issue (one PR).

For sessions tackling multiple features:
- Run `/feature-roadmap-implement` once per feature
- Each run: select → implement → test → PR → update roadmap
- Stop after 3 PRs in a session (or when the user stops invoking)

The PR summary always includes "Next implementable issue: #NNN" so the user can immediately invoke again.

---

## When to Use

- Immediately after `/feature-roadmap` creates issues and writes the consolidated roadmap
- At the start of each implementation session ("pick up the next roadmap item")
- After a PR is merged and you want to proceed to the next feature
- When the user asks "build the next feature", "implement next roadmap issue", "continue the sprint"

## When NOT to Use

- When the issue has unresolved design questions — resolve in the issue comments first
- When the issue has external blockers (e.g., API key not available, DB not accessible)
- For bug fixes or tech debt — use `/roadmap-proceed` for those
- For issues requiring architectural decisions — comment on the issue with a proposal and get approval first
