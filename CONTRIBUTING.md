# Contributing to GrokChess

Thank you for your interest in contributing to GrokChess! This project was built by **Saad Kamal** with **xAI's Grok 4.3**.

We welcome contributions that improve the educational value, code quality, or user experience of the application.

## Code of Conduct

Be respectful, kind, and constructive. We are building a tool to help people learn and enjoy chess.

## How to Contribute

### Reporting Bugs

- Use the **Bug report** issue template.
- Include clear steps to reproduce.
- Mention browser, OS, and device if relevant.
- If possible, provide a FEN or describe the position that triggers the issue.

### Suggesting Features

- Use the **Feature request** issue template.
- Explain the educational or UX value of the feature.
- Keep the "plain English coach" philosophy in mind.

### Pull Requests

1. Fork the repository.
2. Create a branch from `main` (`git checkout -b feature/your-feature-name`).
3. Make your changes.
4. Ensure all tests pass (`npm test`).
5. Run the linter (`npm run lint`).
6. Update documentation if needed.
7. Open a Pull Request with a clear description.

### Development Setup

```bash
git clone https://github.com/saadkamal/GrokChess.git
cd GrokChess
npm install
npm run dev
```

### Running Tests

```bash
npm test
npm run test:coverage
```

### Code Style

- We use TypeScript strictly.
- Prefer pure functions for chess logic (see `src/lib/chessLogic.ts`).
- Keep UI components focused.
- Write meaningful commit messages.

## Areas Where Help is Welcome

- Expanding unit test coverage
- Improving coach explanations
- Better mobile experience
- Accessibility improvements (ARIA, keyboard navigation)
- Performance optimizations (especially around Stockfish worker)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

**Built by Saad Kamal with xAI's Grok 4.3**
