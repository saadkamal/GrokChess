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

### Pull Requests & Branching

The `main` branch is **protected**. Direct pushes to `main` are not allowed.

#### Workflow (for everyone, including the maintainer)
1. Create a feature branch from `main`:
   ```bash
   git checkout -b feat/your-feature-name
   ```
2. Make your changes.
3. Ensure all tests pass:
   ```bash
   npm test
   ```
4. Run the linter:
   ```bash
   npm run lint
   ```
5. Push your branch and open a Pull Request against `main`.
6. All PRs require:
   - At least 1 approving review from a code owner
   - All CI checks (`lint-and-test`) to pass
   - Branch to be up to date with `main`
   - All conversations resolved

#### Maintainer Role
As the maintainer (Saad Kamal), you have final say on what gets merged. You are expected to review and merge contributions. You may also push directly in rare cases (via temporary bypass if needed), but the normal flow is still through PRs for transparency.

#### Merging Strategy
- **Default**: Squash and merge (recommended for most contributions)
  - Keeps history clean and linear
  - Each PR becomes one commit with a clear message
- You may choose **Rebase and merge** for small, clean PRs where you want to preserve individual commits.
- We generally avoid regular "Merge commits" unless there's a strong reason (complex feature with many related PRs).

We follow a simple naming convention for branches:
- `feat/` for new features
- `fix/` for bug fixes
- `chore/` for maintenance / dependency updates
- `docs/` for documentation changes

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
