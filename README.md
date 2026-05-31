# GrokChess

<p align="center">
  <a href="https://github.com/saadkamal/GrokChess/stargazers"><img src="https://img.shields.io/github/stars/saadkamal/GrokChess?style=social" alt="GitHub Stars"></a>
  <a href="https://github.com/saadkamal/GrokChess/blob/main/LICENSE"><img src="https://img.shields.io/github/license/saadkamal/GrokChess" alt="License"></a>
  <a href="https://github.com/saadkamal/GrokChess/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/saadkamal/GrokChess/ci.yml?branch=main" alt="CI Status"></a>
  <a href="https://github.com/saadkamal/GrokChess"><img src="https://img.shields.io/github/last-commit/saadkamal/GrokChess" alt="Last Commit"></a>
</p>

A beautiful, educational chess trainer built for the modern web.

Play against a Stockfish-powered AI at three difficulty levels (Beginner, Club Player, Expert) with real-time coaching that explains moves in plain English — no SAN notation, no jargon.

**Built by Saad Kamal with xAI's Grok 4.3 (April 2026 release)**

<p align="center">
  <strong><a href="https://www.grokchess.com/">▶ Play the Live Demo</a></strong>
</p>

<p align="center">
  <a href="https://www.grokchess.com/">www.grokchess.com</a> &nbsp;•&nbsp; <a href="https://github.com/saadkamal/GrokChess">GitHub</a>
</p>

## Features

- **Three AI Levels**
  - Beginner: Forgiving, great for learning fundamentals
  - Club Player: Solid tactical and positional play
  - Expert: Strong calculation with deeper search

- **Intelligent Real-Time Coach**
  - Automatically recommends the best move after every opponent reply
  - Explains *why* a move is good in beginner-friendly language
  - Highlights origin and destination squares clearly
  - Handles captures, checks, development, and center control explanations

- **Premium Dark UI**
  - Holographic-inspired design with subtle cyan accents
  - Smooth animations and satisfying piece movement
  - Clean, distraction-free experience

- **Quality of Life**
  - Take back moves (undoes the last two half-moves)
  - Keyboard shortcuts (⌘/Ctrl + Z to take back, ⌘/Ctrl + R to reset game, 1/2/3 to change difficulty)
  - Works well on desktop browsers (mobile experience is basic / not a primary focus)

## Tech Stack

- React 19 + TypeScript
- Vite
- chess.js (move validation & game state)
- react-chessboard (rendering & interaction)
- Stockfish 16 WASM (Club Player & Expert levels)
- Custom alpha-beta + piece-square tables (Beginner level)
- Tailwind CSS v4
- Framer Motion + Sonner

## Getting Started

### Prerequisites

- Node.js 20+
- npm or pnpm

### Installation

```bash
git clone https://github.com/saadkamal/GrokChess.git
cd GrokChess
npm install
```

### Development

```bash
npm run dev
```

Open http://localhost:5173

### Production Build

```bash
npm run build
npm run preview
```

### Deploy to Railway (Recommended)

Since the project uses a `Dockerfile` (needed for the special headers that Stockfish WASM requires), deploy directly from GitHub:

1. Go to [Railway.app](https://railway.app) and open/create your project.
2. Click **New Service** → **Deploy from GitHub Repo**.
3. Select the repo `saadkamal/GrokChess`.
4. **Critical**: Set **Root Directory** to `/` (the root of the repo).
5. Railway will automatically detect and use the `Dockerfile`.
6. Deploy.

The included `server.js` will handle serving the built files with the required COEP/COOP headers.

**Custom Domain**: You can add one easily in the service settings after the first successful deployment.  
For example, this project is live at [www.grokchess.com](https://www.grokchess.com/).

**Note**: Avoid using `railway up` from your local machine (especially on macOS) — it frequently fails due to permission errors when scanning your home directory. Always deploy from the GitHub repository through the dashboard.

### Testing

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## Project Structure

```
src/
├── App.tsx                 # Main game logic + UI
├── lib/
│   ├── stockfishService.ts # Stockfish WASM integration
│   └── stockfish.worker.ts # Web Worker for engine
├── main.tsx
└── index.css               # Design system + holographic styles
```

## How the AI Works

- **Beginner**: Lightweight custom alpha-beta search with piece-square tables. Occasionally makes sub-optimal moves for a more forgiving experience.
- **Club Player & Expert**: Full Stockfish 16 running in the browser via WebAssembly (WASM). Uses time/depth limits and skill level settings.
- The real-time coach uses fast engine analysis to suggest the best reply and explains it in plain language.

**Important**: All chess engine computation happens 100% client-side in a Web Worker. Nothing is sent to any server.

The production server (`server.js`) is only used for static file serving + the necessary headers for WASM to function.

## License

MIT © Saad Kamal

This project was built in collaboration with xAI's Grok 4.3.

## Credits & Attribution

This project was created through close collaboration between:

- **Saad Kamal** — Product vision, design direction, iteration, and overall direction
- **xAI's Grok 4.3** (April 2026) — Core architecture, implementation, coaching system, testing, documentation, and open-source setup

Both are listed as co-authors on the initial commit.

Special thanks to the authors of chess.js, react-chessboard, and the Stockfish team.

## Contributing & Community

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

- [Code of Conduct](CODE_OF_CONDUCT.md)
- [Security Policy](SECURITY.md)
- [Issue Templates](.github/ISSUE_TEMPLATE/)
- [Pull Request Template](.github/PULL_REQUEST_TEMPLATE.md)

### Branching & Merging Policy

- The `main` branch is **protected** — direct pushes are not allowed.
- All changes must go through Pull Requests.
- **Default merge method**: **Squash and merge** (preferred for clean, linear history).
- **Rebase and merge** is allowed for small, well-structured PRs where preserving individual commits is valuable.
- Regular merge commits are disabled.
- The maintainer (Saad Kamal) reviews and merges all contributions.

This policy keeps the project history clean and easy to follow while ensuring the maintainer has final control.

---

If you find this project helpful for learning or teaching chess, feel free to star it and share it.

