#!/bin/bash
set -e

# Navigate to repo root
cd "$(dirname "$0")/.."

# Install all dependencies from root (handles workspaces)
npm install

# Build shared package first
npm run build -w shared

# Build backend
npm run build -w backend
