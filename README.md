# GrokChess

<p align="center">
  <a href="https://github.com/saadkamal/grokchess/stargazers"><img src="https://img.shields.io/github/stars/saadkamal/grokchess?style=social" alt="GitHub Stars"></a>
  <a href="https://github.com/saadkamal/grokchess/blob/main/LICENSE"><img src="https://img.shields.io/github/license/saadkamal/grokchess" alt="License"></a>
  <!-- CI badge removed until workflow is added -->
  <a href="https://github.com/saadkamal/grokchess"><img src="https://img.shields.io/github/last-commit/saadkamal/grokchess" alt="Last Commit"></a>
</p>

A beautiful, educational chess trainer built for the modern web.

Play against a Stockfish-powered AI at three difficulty levels (Beginner, Club Player, Expert) with real-time coaching that explains moves in plain English — no SAN notation, no jargon.

**Built by Saad Kamal with xAI's Grok 4.3 (April 2026 release)**

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
git clone https://github.com/saadkamal/grokchess.git
cd grokchess
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

1. Push your code to GitHub.
2. Go to [Railway.app](https://railway.app) and create a new project.
3. Connect your GitHub repo (`saadkamal/grokchess`).
4. Railway will auto-detect Node.js.
5. Set the following:
   - **Build Command**: `npm run build`
   - **Start Command**: `npm run start`
6. Add these environment variables if needed (usually not required):
   - `NODE_ENV=production`
7. Deploy.

Railway will automatically set the correct `PORT`. The `server.js` includes the required headers for Stockfish to work properly.

**Custom Domain**: You can easily add one in Railway settings.

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

## Credits

- **Saad Kamal** — Concept, design direction, product decisions, and iteration
- **xAI Grok 4.3** — Full implementation, architecture, and code quality

Special thanks to the authors of chess.js, react-chessboard, and the Stockfish team.

---

If you find this project helpful for learning or teaching chess, feel free to star it and share it.

