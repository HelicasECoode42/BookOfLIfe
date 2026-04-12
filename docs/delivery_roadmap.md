# Delivery Roadmap

## P0

Goal:

- Build a stable iPhone demo app that can be installed, connected to the backend, and demonstrated end to end.

Scope:

- close the voice entry chain so it never dead-ends
- make iOS native speech compile through the Capacitor shell
- stabilize chat -> candidate -> memory save flow
- make photo recall work from time and description hints
- ensure backend connectivity is traceable on device

Acceptance:

- app installs and opens on iPhone
- user can send text and receive a reply
- user can tap voice and either get native recognition or an editable draft fallback
- candidate memory prompt appears on prepared demo inputs
- saved memory remains visible after relaunch
- recalled photo can be surfaced and used in follow-up conversation

## P1

Goal:

- Turn the prototype into a stronger wrap-up demo with clearer "memory intelligence" value.

Scope:

- restore `lifeSummaries`
- restore `profile-insights`
- restore `factDatabase`
- restore `personAliases`
- strengthen graph rendering from structured memory state
- improve photo organization by person, event, and time
- upgrade `memory-filter` so人物关系描述和性格印象句也能进入候选记忆池，而不是只认完整事件句
- refine candidate summaries to use context, person/event type, and concrete timestamps instead of echoing the latest sentence
- clean memory card tags to only keep meaningful facets such as person, place, time, and mood
- shift timeline rendering from count-based summaries to important memory nodes, with support for finer-grained date views

Acceptance:

- graph reflects structured entities instead of only frontend cards
- profile page shows stable long-term summaries
- the app can connect people, events, and photos in repeated demos
- structured memory state survives across multiple sessions
- inputs like “老徐特别肝” or “我先带老徐玩的” can surface as `person_clue` candidates on device
- sidebar and candidate summaries read like memory organization, not a repetition of the last utterance

## P2

Goal:

- Polish the app into a more credible research-project deliverable.

Scope:

- add guided demo seeds and better empty states
- improve revision loop for correcting time / person / event
- optimize graph readability and memory browsing
- add release checklist, demo script, and failure fallback notes

Acceptance:

- a new viewer can understand the app without verbal explanation
- demo path can recover from network or speech failure without breaking the presentation
- project documentation is complete enough for handoff and wrap-up review

## Immediate Next Step

- Finish on-device validation for native speech recognition on a real iPhone.
- If runtime permission or callback behavior still fails, inspect native logs before changing more frontend logic.
