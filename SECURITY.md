# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |

## Reporting a Vulnerability

GrokChess is a **client-side only** application. All chess computation (including Stockfish) happens in your browser via WebAssembly.

If you discover a security vulnerability, please report it responsibly:

- Open a private security advisory on GitHub, **or**
- Email the maintainer directly (if you have access to contact info)

We take security seriously and will respond promptly to valid reports.

### Scope

This project does **not**:
- Send any data to external servers
- Store user data
- Use any third-party analytics or tracking

The main attack surface is the Stockfish WebAssembly worker and any future features that might involve user input.

Thank you for helping keep GrokChess safe.
