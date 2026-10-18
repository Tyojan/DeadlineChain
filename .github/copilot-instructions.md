# DeadlineChain Copilot Instructions

## Project overview

- DeadlineChain is a static Next.js application that visualizes conference deadlines.
- Conference data is stored in `public/conference.json`.
- Display filter settings are stored in `public/preferences.json`.
- The production site is deployed to GitHub Pages.

## Communication

- Write pull request descriptions, comments, and user-facing explanations in Japanese.
- Before making a change of more than 100 lines outside a data-only request, propose a plan in Japanese.

## Conference-data tasks

When an issue contains official CFP or deadline-page URLs:

- Treat every URL in the issue as a source to investigate.
- Use official CFP or conference pages as the source for deadlines, location, and event dates.
- Add one `public/conference.json` entry for every submission cycle found.
- Do not infer or invent dates, locations, classifications, or ranks.
- If an official source cannot be accessed or essential data cannot be verified, do not edit `public/conference.json`. Report the blocked URL and the missing data instead.
- Never create a placeholder entry with an empty `deadlines` object, empty classification arrays, or an empty classification value.
- Set `rank` only when it can be verified from a reliable ranking source. Otherwise, omit `rank`.
- Preserve the existing JSON structure. Put `classification` after `event`; if there is no `event`, put it last.
- Use arrays for `classification.topics` and `classification.venue_type`.
- For a journal/conference hybrid, use both venue types, for example `"venue_type": ["conference", "journal"]`.
- Do not modify unrelated application files for a data-only request.

## Validation and pull requests

- Validate JSON and run `npm run build` before opening a pull request.
- In the pull request description, list every source URL consulted, each entry and submission cycle added or changed, and any omitted or uncertain field, especially `rank`.
- Never merge a pull request yourself; request maintainer review.
