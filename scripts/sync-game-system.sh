#!/bin/sh
# Récupère depuis supershivas/game-system (branche main) :
#   - CONVENTIONS.md -> ./.claude/conventions-jeu.md (toujours ; importé par CLAUDE.md)
#   - CONVENTIONS-DETAIL.md -> ./.claude/conventions-detail.md (toujours ; lu à la demande)
#   - les modules (modules/*) et les outils (outils/*) -> mis à jour LÀ OÙ LE JEU
#     EN A DÉJÀ UNE COPIE, et seulement dans les dossiers réservés : js/lib/,
#     src/lib/ ou lib/ pour les modules, outils/ pour les outils. Jamais
#     ailleurs : un jeu peut avoir son propre js/keys.js (Kingvi). Pour
#     adopter un module, copie-le une fois dans js/lib/ ; il suivra ensuite.
# Lancé par le hook SessionStart (.claude/settings.json).
# Chaque fichier est téléchargé dans un fichier temporaire puis déplacé :
# si le réseau échoue, l'ancienne copie est conservée.
# Ne sort jamais en erreur, pour ne pas bloquer la session.

BASE_URL="https://raw.githubusercontent.com/supershivas/game-system/main"

cd "$(dirname "$0")/.." 2>/dev/null || exit 0

fetch() {
  src="$1"
  dest="$2"
  mkdir -p "$(dirname "$dest")" 2>/dev/null || return 0
  tmp="$dest.tmp.$$"
  if curl -fsSL --max-time 15 "$BASE_URL/$src" -o "$tmp" 2>/dev/null && [ -s "$tmp" ]; then
    if [ -f "$dest" ] && cmp -s "$tmp" "$dest"; then
      rm -f "$tmp"
    else
      mv "$tmp" "$dest" && echo "game-system : $dest mis à jour"
    fi
  else
    rm -f "$tmp"
    echo "game-system : échec du téléchargement de $src, copie existante conservée" >&2
  fi
}

fetch CONVENTIONS.md .claude/conventions-jeu.md
fetch CONVENTIONS-DETAIL.md .claude/conventions-detail.md

MODULES="app-update.js keys.js pointer.js loop.js pixel-canvas.js rng.js save.js debug.js sprites.js audio.js gamepad.js i18n.js gh-publish.js labo-shell.js labo-shell.css labo-timeline.js pixel-editor.js game.css"
for file in $MODULES; do
  for dir in js/lib src/lib lib; do
    [ -f "$dir/$file" ] && fetch "modules/$file" "$dir/$file"
  done
done

OUTILS="navigateur.mjs test-run.mjs captures.mjs audit-ecran.mjs lisibilite.mjs stamp-version.mjs icones.mjs decouper-claude-md.mjs playtest/run.mjs"
for file in $OUTILS; do
  [ -f "outils/$file" ] && fetch "outils/$file" "outils/$file"
done

# Le script se met à jour lui-même en dernier
fetch templates/sync-game-system.sh scripts/sync-game-system.sh

exit 0
