#!/bin/bash
# Get the file path from hook input
FILE_PATHS=$(jq -r '.tool_input.file_path // .tool_input.edits[]?.file_path // empty')

# Only run if the file is in the backend directory
if [[ "$FILE_PATH" == backend/* ]] || [[ "$FILE_PATH" == */backend/* ]]; then
    uv run --project backend ruff check 2>&1 || exit 2
    uv run --project backend basedpyright --level error 2>&1 || exit 2
    echo "Backend linting and type checking passed"
fi