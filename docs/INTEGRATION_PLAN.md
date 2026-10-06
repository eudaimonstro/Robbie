# Robbie-Bylawyer Integration Plan

## Overview

This document describes how motions made in Robbie (parliamentary procedure app) that pertain to bylaws can be accessed and managed in Bylawyer (bylaws version control).

## Current State

### Robbie Data Model

- **Meeting**: Contains meeting state including `completedMotions[]`
- **CompletedMotion**: `{ id, type, name, text, passed, voterChoices, timestamp }`
- **Motion types**: Main motions, amendments, and various procedural motions

### Bylawyer Data Model

- **Organization**: Top-level entity
- **Document**: Bylaws, standing rules, policies
- **Amendment**: Proposed changes with workflow (draft → proposed → passed/failed)
- **Meeting**: Records where votes occur
- **Vote**: Vote tallies on amendments

## Integration Architecture

### Phase 1: Organization Linking

Connect Robbie meetings to Bylawyer organizations.

```
┌─────────────────┐         ┌─────────────────┐
│     Robbie      │         │    Bylawyer     │
│    Database     │         │    Database     │
├─────────────────┤         ├─────────────────┤
│ meetings        │────────▶│ organizations   │
│ - organization_ │ FK      │ - id            │
│   id (new)      │         │ - name          │
└─────────────────┘         └─────────────────┘
```

**Schema Changes:**

1. Add to Robbie `meetings` table:

   ```sql
   ALTER TABLE meetings
   ADD COLUMN bylawyer_organization_id UUID REFERENCES bylawyer.organizations(id);
   ```

2. Create cross-database view or use same PostgreSQL instance with separate schemas.

### Phase 2: Motion Type Enhancement

Add a new motion type in Robbie specifically for bylaw amendments.

**New Motion Type: `bylawAmendment`**

```typescript
interface BylawAmendmentMotion extends Motion {
  type: 'bylawAmendment';
  bylawAmendment: {
    documentId: string; // Bylawyer document ID
    changeType: 'add' | 'modify' | 'delete' | 'renumber';
    targetSectionId?: string; // Section being modified
    newContent?: string; // New/modified content
    newNumberLabel?: string; // New section number
    newTitle?: string; // New section title
  };
}
```

### Phase 3: Automatic Synchronization

When a bylaw amendment motion passes in Robbie, automatically update Bylawyer.

**Workflow:**

```
┌──────────────────────────────────────────────────────────────────┐
│                     ROBBIE MEETING                                │
│                                                                   │
│  1. Chair creates bylaw amendment motion                         │
│     - Selects document from linked Bylawyer org                  │
│     - Specifies section and changes                              │
│                                                                   │
│  2. Motion is seconded and debated                               │
│                                                                   │
│  3. Vote is taken                                                │
│     └─► If PASSED ─────────────────────────────────────────────┐ │
│                                                                 │ │
└─────────────────────────────────────────────────────────────────┘ │
                                                                    │
┌─────────────────────────────────────────────────────────────────┐ │
│                     BYLAWYER SYNC                               │◀┘
│                                                                   │
│  4. Create or update Amendment in Bylawyer                       │
│     - Status: 'passed'                                           │
│     - Link to Robbie meeting/vote data                           │
│                                                                   │
│  5. Create Vote record with details from Robbie                  │
│     - yeaCount, nayCount, abstainCount                           │
│     - voterChoices (roll call)                                   │
│                                                                   │
│  6. Apply amendment to create new Document Version               │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

### Phase 4: Cross-Reference UI

**In Robbie:**

- When creating a bylaw amendment motion, show document/section picker from Bylawyer
- Display current bylaws text during debate
- Show amendment history for context

**In Bylawyer:**

- Show linked Robbie meeting details on amendments
- Display vote results from Robbie meetings
- Link to meeting minutes

## Database Schema Changes

### Shared Schema (recommended approach)

Use a single PostgreSQL instance with separate schemas:

```sql
-- Shared connection table
CREATE SCHEMA shared;

CREATE TABLE shared.organization_meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bylawyer_org_id UUID NOT NULL,
  robbie_meeting_code VARCHAR(8) NOT NULL,
  linked_at TIMESTAMP DEFAULT NOW(),
  linked_by VARCHAR(255),
  UNIQUE(robbie_meeting_code)
);

CREATE TABLE shared.motion_amendments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  robbie_motion_id INTEGER NOT NULL,
  robbie_meeting_code VARCHAR(8) NOT NULL,
  bylawyer_amendment_id UUID NOT NULL,
  synced_at TIMESTAMP DEFAULT NOW(),
  sync_status VARCHAR(20) DEFAULT 'pending',
  UNIQUE(robbie_meeting_code, robbie_motion_id)
);
```

### Robbie Schema Additions

```sql
-- Add to meetings table
ALTER TABLE robbie.meetings
ADD COLUMN bylawyer_org_id UUID;

-- Add to meeting state (in JSONB)
-- completedMotions[].bylawAmendment = { documentId, amendmentId, ... }
```

### Bylawyer Schema Additions

```sql
-- Add to amendments table
ALTER TABLE bylawyer."Amendment"
ADD COLUMN robbie_meeting_code VARCHAR(8),
ADD COLUMN robbie_motion_id INTEGER,
ADD COLUMN robbie_vote_data JSONB;
```

## API Integration

### New Endpoints

**Robbie API:**

```
GET  /api/bylawyer/organizations         # List linked organizations
GET  /api/bylawyer/documents/:orgId      # Get documents for org
GET  /api/bylawyer/sections/:docId       # Get section tree
POST /api/bylawyer/link-meeting          # Link meeting to org
```

**Bylawyer API:**

```
GET  /api/robbie/meetings/:amendmentId   # Get linked meeting details
POST /api/robbie/sync-motion             # Sync passed motion to amendment
```

### Sync Service

Create a shared service that handles synchronization:

```typescript
// shared/src/services/bylawSync.ts

interface SyncMotionRequest {
  robbieMotion: CompletedMotion;
  meetingCode: string;
  bylawAmendment: {
    documentId: string;
    changeType: 'add' | 'modify' | 'delete' | 'renumber';
    targetSectionId?: string;
    newContent?: string;
  };
}

async function syncPassedMotionToAmendment(req: SyncMotionRequest): Promise<void> {
  // 1. Create or update Amendment in Bylawyer
  // 2. Create Vote record
  // 3. If passed, apply amendment to create new version
}
```

## Implementation Steps

### Step 1: Database Setup

1. ✅ Create PostgreSQL databases for both apps
2. Add shared schema for cross-references
3. Run migrations for schema changes

### Step 2: API Integration Layer

1. Create shared API client in `shared/` package
2. Add Bylawyer endpoints to Robbie backend
3. Add Robbie endpoints to Bylawyer backend

### Step 3: UI Integration - Robbie

1. Add "Bylaw Amendment" motion type to motion picker
2. Create document/section selector component
3. Show bylaws text during debate
4. Display sync status for passed amendments

### Step 4: UI Integration - Bylawyer

1. Show linked meeting info on amendment detail page
2. Display vote results from Robbie
3. Add "View in Robbie" link to meeting

### Step 5: Sync Service

1. Implement motion-to-amendment sync
2. Add webhook/event system for real-time updates
3. Handle conflict resolution

## Configuration

Add to `.env` files:

```bash
# backend-node/.env
BYLAWYER_API_URL=http://localhost:8000
BYLAWYER_API_KEY=shared-secret-key

# backend-bylawyer/.env
ROBBIE_API_URL=http://localhost:3001
ROBBIE_API_KEY=shared-secret-key
```

## Security Considerations

1. **API Authentication**: Use shared API keys or JWT for service-to-service communication
2. **Data Validation**: Validate all cross-service data
3. **Audit Trail**: Log all sync operations
4. **Rollback**: Support undoing sync operations

## Future Enhancements

1. **Real-time Sync**: Use WebSocket or polling for live updates
2. **Batch Operations**: Sync multiple motions at once
3. **Conflict Resolution**: Handle concurrent edits
4. **Notifications**: Alert users when bylaws are updated
5. **Reports**: Generate combined meeting/amendment reports
