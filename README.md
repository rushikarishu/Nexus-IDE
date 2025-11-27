# Nexus IDE

Nexus IDE is a lightweight, high-performance code editor built with Tauri, React, and Rust. It features a terminal, file explorer, and LSP support for Rust.

## Prerequisites

- Node.js (v18+)
- Rust (stable)
- Tauri CLI (`cargo install tauri-cli`)

## Setup

1. Install frontend dependencies:
   ```bash
   npm install
   ```

## Development

Run the development server:
```bash
npm run tauri dev
```

## Quality Gates

### Frontend
- **Linting**: `npm run lint`
- **Testing**: `npm test`

### Backend
- **Linting**: `cargo clippy`
- **Testing**: `cargo test` (in `src-tauri` directory)

## Building for Production

Build the application for your platform:
```bash
npm run tauri build
```

## Security

This project enforces strict CSP and filesystem boundaries.
- **Workspace Root**: File access is restricted to the opened folder.
- **Run Safety**: Code execution requires user confirmation.
