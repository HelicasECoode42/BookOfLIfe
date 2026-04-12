# version_app2 Integration Handoff

## Today status

- Mobile shell is still based on [app.html](/Users/wangyufan/Desktop/HelicasE/大学生创新创业/version_app2/app.html), not a full reuse of the original multi-page frontend.
- Core backend endpoints still exist in [server.js](/Users/wangyufan/Desktop/HelicasE/大学生创新创业/version_app2/server.js).
- Part of the original memory pipeline has already been reconnected into the mobile shell:
  - `reply-plan`
  - `memory-filter`
  - `chat-recap`
  - `memory-draft`
  - `memory-structure`
  - `activeEventContext`
  - `revisionLogs`
  - `memoryCandidates`

## Current diagnosis of `DownloadFailed`

Most likely cause:

- The recently added plugin `@capacitor-community/speech-recognition` is not fully SPM-compatible in the current Capacitor iOS integration path.
- Capacitor sync already warned:
  - `@capacitor-community/speech-recognition does not have a Package.swift`
  - `Some installed packages are not compatable with SPM`

Evidence:

- [package.json](/Users/wangyufan/Desktop/HelicasE/大学生创新创业/version_app2/package.json) now includes `@capacitor-community/speech-recognition`.
- [CapApp-SPM/Package.swift](/Users/wangyufan/Desktop/HelicasE/大学生创新创业/version_app2/ios/App/CapApp-SPM/Package.swift) only contains:
  - `capacitor-swift-pm`
  - `@capacitor/camera`
- The speech plugin is not present in `CapApp-SPM/Package.swift`, which is consistent with the warning above.

What this means:

- `npm run cap:sync:ios` can finish.
- `xcodebuild` can still pass a local build check.
- But Xcode may fail while updating package lists or resolving dependencies in the GUI, showing `Updated list with error: DownloadFailed`.
- So the failure is most likely native dependency resolution, not the HTML/CSS/JS changes.

## Recommended next step for the speech plugin

Two options:

1. Keep the plugin and switch iOS integration away from the current SPM-only path for this plugin.
   - This likely means handling the plugin through CocoaPods/manual native integration instead of expecting SPM.

2. Remove the plugin temporarily and keep the current fallback flow.
   - This avoids Xcode dependency resolution instability.
   - It does not provide true iPhone native speech recognition.

Current recommendation:

- Do not continue adding more native plugins before deciding which iOS dependency path to standardize on.
- If the priority is "app installs reliably tomorrow", temporarily rolling back the speech plugin is the safer path.
- If the priority is "must have native speech", then the next task should be: make the iOS dependency integration consistent for this plugin first.

## What has already been changed in the mobile app

### UI / shell

- Bottom tabs renamed to:
  - `温伴`
  - `忆光`
  - `图谱`
  - `我的`
- Chat header restored with a clearer brown title block.
- Message content is no longer intentionally prefixed with timestamps in the AI prompt context.

### Memory flow

- Chat now writes through:
  - `reply-plan`
  - `memory-filter`
  - `chat-recap`
- Candidate memory cues can enter:
  - `memoryCandidates`
  - `pendingCues`
  - `activeEventContext`
  - `revisionLogs`
- Candidate decision modal exists:
  - `现在整理`
  - `过会儿`

### Book / Yiguang

- Saving from the memory modal now routes through:
  - `memory-draft`
  - `memory-structure`
- Candidate items can be promoted into book entries.

### Photos

- Photo permission request exists.
- Native photo picking exists.
- Upload to backend exists.
- Basic photo recall cue exists.

## Why the candidate modal still felt inconsistent

Root cause:

- The modal existed in the frontend, but the trigger path was too fragile.
- It was effectively chained too closely to the AI reply flow.

What was changed:

- Candidate popup now still depends on AI backend judgment through `memory-filter`.
- But it no longer depends on `/api/ai` text reply success.

What still needs verification:

- Real-device behavior must confirm that `memory-filter` returns a candidate for actual user inputs.
- If no popup appears after this logic change, the next debugging step is to log:
  - `reply-plan` response
  - `memory-filter` response
  - popup open call

## Not fully migrated yet

These original architecture pieces are still not fully restored in the mobile shell:

- `lifeSummaries`
- `profile-insights`
- `factDatabase`
- `personAliases`
- full graph rendering from structured memory state
- full photo-to-person/time/event organization
- full revision loop for time/person/event correction
- complete long-term memory organization from the original system

## Recommended implementation order for next session

1. Decide speech plugin strategy first.
   - Either remove it for stability.
   - Or complete proper iOS native integration.

2. Add explicit debug logs for candidate popup chain.
   - Log `reply-plan`
   - Log `memory-filter`
   - Log modal trigger

3. Finish migration of original structured memory state:
   - `lifeSummaries`
   - `profile-insights`
   - `factDatabase`
   - `personAliases`

4. Rebuild graph from real structured state instead of mostly frontend-derived cards.

5. Reconnect photo organization into:
   - people
   - time
   - event
   - graph

## Useful files

- [app.html](/Users/wangyufan/Desktop/HelicasE/大学生创新创业/version_app2/app.html)
- [server.js](/Users/wangyufan/Desktop/HelicasE/大学生创新创业/version_app2/server.js)
- [package.json](/Users/wangyufan/Desktop/HelicasE/大学生创新创业/version_app2/package.json)
- [Info.plist](/Users/wangyufan/Desktop/HelicasE/大学生创新创业/version_app2/ios/App/App/Info.plist)
- [CapApp-SPM/Package.swift](/Users/wangyufan/Desktop/HelicasE/大学生创新创业/version_app2/ios/App/CapApp-SPM/Package.swift)
- [script.js](/Users/wangyufan/Desktop/HelicasE/大学生创新创业/verson_app/script.js)

