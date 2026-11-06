#!/bin/sh
set -eu

sandbox=$(mktemp -d)
trap 'rm -r "$sandbox"' EXIT
mkdir "$sandbox/context"
git ls-files -z | tar --null -T - -cf - | tar -xf - -C "$sandbox/context"
# Overlay the current candidate files without copying any local run data.
cp .dockerignore "$sandbox/context/"
canary="dgr-build-canary-$(date +%s)-$$"
cd "$sandbox/context"
for directory in data .dgr-research-documents research-results; do
  mkdir -p "$directory"
  printf '%s\n' "$canary" > "$directory/runtime-canary"
done
printf '%s\n' "$canary" > .env
printf '%s\n' "$canary" > tasks.json
printf 'FROM scratch\nCOPY . /\n' | docker build --file - --output "type=local,dest=$sandbox/export" .
test ! -e "$sandbox/export/.env"
test ! -e "$sandbox/export/tasks.json"
for directory in data .dgr-research-documents research-results; do
  test ! -e "$sandbox/export/$directory/runtime-canary"
done
