# P0 Delivery Plan

## Goal

Turn `version_app2` into a stable iPhone demo app that can:

- install on a real device
- connect to the backend reliably
- show the core memory flow end to end
- support a clean project wrap-up video

## Core Demo Story

1. User opens `温伴忆光` on iPhone.
2. User says or types a life fragment.
3. The app replies gently and decides whether the fragment is worth keeping.
4. A candidate memory prompt appears.
5. The user saves it into `忆光`.
6. The user recalls a photo by time or description.
7. The app surfaces the related photo and continues the memory conversation.
8. The memory and photo both appear in the book / graph view.

## P0 Scope

### 1. Voice Chain Closure

Target:

- The voice entry can no longer fail into a dead end.
- If native voice is unavailable, the app must always fall back to an editable draft.

Files:

- `app.html`
- `package.json`
- `ios/App/CapApp-SPM/Package.swift`
- `ios/App/App/Info.plist`

Acceptance:

- tapping the voice button always gives the user a usable next step
- voice failure never blocks the conversation flow
- the app clearly explains whether it is using native voice, browser voice, or a draft fallback

### 2. Real Device Install and Backend Connectivity

Target:

- The iPhone app must reliably talk to the backend.

Files:

- `scripts/build_mobile_web.mjs`
- `mobile_web/app-config.js`
- `capacitor.config.ts`
- `app.html`

Acceptance:

- app launch shows a working backend connection
- first chat request returns successfully
- API base configuration is traceable and recoverable

### 3. Chat to Candidate to Memory Flow

Target:

- The main flow must be stable enough for repeated demos.

Files:

- `app.html`
- `server.js`

Acceptance:

- `reply-plan`, `memory-filter`, and candidate modal open are traceable in logs
- at least 3 prepared inputs trigger the candidate memory flow reliably
- saved memories persist after refresh / relaunch

### 4. Photo Recall as a First-Class Feature

Target:

- Photos are not just uploads.
- The app should recall a related photo from time hints or user description and use it to continue the conversation.

Files:

- `app.html`
- `server.js`

Acceptance:

- a user prompt like "把去年春节那张照片找出来" can surface a related photo
- the assistant asks a concrete follow-up question around that photo
- the resulting conversation can still enter the candidate memory pipeline

### 5. Engineering Cleanup

Target:

- The project should look like a deliverable prototype, not an unfinished merge state.

Files:

- `README.md`
- `scripts/stage_m3_ios_shell_smoke.mjs`
- `scripts/stage13_integration_smoke.mjs`

Acceptance:

- stale or conflicting documentation is removed
- smoke checks reflect the current iOS shell structure
- there is a single reviewable P0 plan in the repo

## Demo Acceptance Checklist

- iPhone app launches without crashing
- backend is reachable from the device
- user can send a text message and get a reply
- candidate memory prompt can appear
- candidate memory can be saved into `忆光`
- a photo can be recalled from time or description
- the recalled photo shows inside the app
- the graph / book view reflects the new content

## Notes

- Dialect ASR is valuable but not a hard P0 acceptance requirement.
- For wrap-up, stable fallback behavior is better than a fragile native-only path.
