# Autonomous Workflows

This document describes autonomous workflows that the agent framework can execute automatically to solve common development issues.

## Supabase Backend Setup Workflow

### Problem Solved
When working on features that require Supabase backend (database, storage, auth), the agent previously:
- Discovered Supabase credentials were configured
- Found migration files existed
- But couldn't automatically apply migrations or verify setup
- Required manual intervention to complete backend features

### Solution
The agent now autonomously:

1. **Detects Supabase Configuration**
   - Checks for `.env` file in project root
   - Extracts `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
   - Verifies credentials are not placeholders

2. **Finds Migration Files**
   - Scans `supabase/migrations/` directory
   - Lists all `.sql` migration files
   - Sorts by timestamp

3. **Checks Migration Status**
   - Tests database connection
   - Verifies table existence
   - Tests INSERT operations to check RLS policies
   - Checks storage bucket existence

4. **Attempts to Apply Migrations**
   - Checks if Supabase CLI is available (`supabase --version`)
   - If available, attempts `supabase db push`
   - If not available, documents required manual steps

5. **Verifies Setup**
   - Tests database operations (INSERT, SELECT)
   - Tests storage bucket access
   - Tests authentication endpoints
   - Updates feature notes with findings

### Implementation

**New Utility Module:** `src/utils/supabase-setup.ts`
- `checkSupabaseConfig()` - Detects and validates Supabase credentials
- `findMigrationFiles()` - Locates migration files in project
- `generateSetupReport()` - Creates comprehensive setup status report
- `getSetupSummary()` - Generates prompt-friendly summary

**Updated Coding Agent Prompt:** `src/agents/prompts/coding.md`
- Added Step 6: "Check Backend Infrastructure (AUTONOMOUS)"
- Added "Backend Infrastructure Setup" section to workflow
- Includes instructions for detecting, applying, and verifying migrations

**Updated Coding Agent:** `src/agents/coding.ts`
- Automatically includes Supabase setup summary in prompt
- Agent sees backend status at start of every session

### Usage

The workflow runs automatically at the start of each coding agent session. The agent will:

1. See Supabase status in the prompt summary
2. Follow the autonomous workflow steps
3. Attempt to resolve backend issues before working on features
4. Document findings in feature notes

### Example Output

```
## SUPABASE BACKEND STATUS

✅ Supabase credentials configured
   URL: https://ynedsbgiveycubmusjzf.supabase.co

📁 Found 15 migration files:
   - 20251119020909_create_applicants_table.sql
   - 20251119020940_create_resumes_storage_bucket.sql
   ... and 13 more

💡 Recommendations:
   - Found 15 migration files - check if they need to be applied
   - Run: supabase db push (if Supabase CLI is installed)
   - Or apply migrations manually via Supabase dashboard SQL editor
```

### Benefits

1. **Proactive Problem Detection** - Agent discovers backend issues early
2. **Autonomous Resolution** - Attempts to fix issues automatically
3. **Clear Documentation** - Documents what needs manual intervention
4. **No Blocking** - Agent can work on other features if backend setup fails
5. **Reusable** - Works for any project with Supabase

### Future Enhancements

- Support for other database systems (PostgreSQL, MySQL, etc.)
- Support for other migration tools (Prisma, TypeORM, etc.)
- Automatic migration file analysis to detect dependencies
- Integration with Supabase Management API for programmatic setup
