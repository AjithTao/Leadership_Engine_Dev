# \<Project name> change log

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Dates in this CHANGELOG follow the [ISO 8601 date format](https://www.w3.org/QA/Tips/iso-date).

<!-- Example

## [Unreleased]

## [1.0.29] - 2022-03-01
### Updated
- [SDE-348](https://projects.cdk.com/browse/SDE-348) Changed athena-libs to v.0.29 to use corrected react-internal build-templates path 

### Fixed
- Updated changelog format to v1.1.0.

-->

## [Unreleased]
### Added
- GitHub integration: connection settings tab with one-click connect, login-time
  auto-connect via an encrypted service token, and a live status indicator in the
  sidebar integrations list.

### Changed
- UI/UX overhaul of the login page, sidebar navigation (Insights sub-nav, status
  badges, accent active indicator), Connection Settings (theming, contrast,
  auto-expanding modal), and the Work Buddy chat (empty-state redesign, welcome
  toast, story/issue-list/count cards, message-layout polish and animations).
- Login errors now distinguish an unreachable server from invalid credentials.

### Fixed
- Work Buddy count queries return the actual total instead of an empty issue card.
- Invalid JQL is reported honestly instead of a misleading count of "0"; generated
  JQL is restricted to real Jira fields, mapping functional-area terms to
  labels/text rather than inventing fields.
- Jira and GitHub "configure" now validate credentials before replacing the live
  client, preventing a bad attempt from degrading existing connections.

## 2022-07-18
### Updated
- [DPSC-1316](https://projects.cdk.com/browse/DPSC-1316) Updated readME.md to include source code policy, as well as a link to a confluence page containing more details.
