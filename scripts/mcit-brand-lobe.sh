#!/bin/sh
# Safe MCIT display branding: only quoted string literals (never bare identifiers).
# Does not strip upstream LICENSE. Org distribution still needs LobeHub commercial rights.
set -eu

safe_brand_file() {
  f=$1
  grep -q 'LobeHub\|LobeChat\|Lobe AI' "$f" 2>/dev/null || return 0
  sed -i \
    -e 's/"LobeHub Cloud"/"MCIT AI"/g' \
    -e "s/'LobeHub Cloud'/'MCIT AI'/g" \
    -e 's/"LobeHub"/"MCIT AI"/g' \
    -e "s/'LobeHub'/'MCIT AI'/g" \
    -e 's/"LobeChat"/"MCIT AI"/g' \
    -e "s/'LobeChat'/'MCIT AI'/g" \
    -e 's/"Lobe AI"/"Thoth"/g' \
    -e "s/'Lobe AI'/'Thoth'/g" \
    -e 's/your LobeHub account/your MCIT AI account/g' \
    -e 's/Create a LobeHub Account/Create a MCIT AI Account/g' \
    -e 's/Create a {{appName}} Account/Create a MCIT AI Account/g' \
    "$f" 2>/dev/null || true
}

brand_tree() {
  [ -d "$1" ] || return 0
  find "$1" -type f \( -name '*.js' -o -name '*.html' -o -name '*.json' -o -name '*.body' \) 2>/dev/null \
    | while IFS= read -r f; do safe_brand_file "$f"; done
}

for d in \
  /app/public/_spa \
  /app/public/_spa-auth \
  /app/public/_spa-share \
  /app/public/_spa-workbench \
  /app/locales \
  /app/.next/static \
  /app/.next/server/chunks \
  /app/.next/server/route-cache
do
  brand_tree "$d"
done

if [ -f /app/public/avatars/tutankhamun.webp ]; then
  cp -f /app/public/avatars/tutankhamun.webp /app/public/avatars/agent-default.png 2>/dev/null || true
  cp -f /app/public/avatars/tutankhamun.webp /app/public/avatars/lobe-ai.png 2>/dev/null || true
fi

echo '[mcit-brand] safe MCIT AI string branding applied'
