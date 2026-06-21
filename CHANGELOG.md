# Changelog

All notable changes to GrokChess will be documented in this file.

## [Unreleased]

### Changed
- Self-host Stockfish 16 WASM assets instead of loading the engine from a CDN.
- Harden Stockfish worker initialization, readiness checks, score parsing, and request timeouts.
- Normalize engine evaluations as White-relative values and preserve mate scores for coach analysis.
- Reuse the tested beginner chess logic from `src/lib/chessLogic.ts` in the app.
- Serve hashed production assets with long-lived cache headers while keeping `index.html` revalidated after deploys.

### Removed
- Removed unused starter/demo assets.

## [1.0.0] - 2026-02

### Links
- Website: [www.grokchess.com](https://www.grokchess.com/)
- GitHub: https://github.com/saadkamal/GrokChess

### Added
- Three difficulty levels: Beginner (custom engine), Club Player & Expert (Stockfish 16 WASM)
- Real-time AI coach with plain-English explanations
- Automatic best move recommendations with square highlighting
- Take-back functionality
- Keyboard shortcuts
- Premium holographic dark UI

### Changed
- Major architecture cleanup for public open source release
- Extracted pure chess logic into `src/lib/chessLogic.ts` for testability
- Added comprehensive unit tests with Vitest

### Credits
**Built by Saad Kamal with xAI's Grok 4.3 (April 2026 release)**

## [0.1.0] - Initial Development

- Initial prototype built through iterative collaboration between Saad Kamal and Grok.
