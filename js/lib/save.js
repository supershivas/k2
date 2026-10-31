/* ─── Sauvegarde — partagé entre les jeux ──────────────────────────────────
   Source de vérité : supershivas/game-system/modules/save.js
   Applique la section 11 de CONVENTIONS.md :
   - clés préfixées par le nom du jeu (`kingvi:save`, `kingvi:prefs`) ;
   - chaque entrée est VERSIONNÉE et migrée à la lecture : une ancienne
     sauvegarde se relit toujours ;
   - sauvegarde automatique régulière et à la fermeture (pagehide,
     visibilitychange) : on ne perd jamais plus de quelques secondes ;
   - en mode debug, les clés changent (`kingvi:debug:save`) et les réglages
     ne sont jamais écrits ;
   - export / import en JSON (jamais les clés secrètes, comme un jeton).
   Tout le stockage du jeu passe par ce module : le jour d'un portage (Steam),
   seul `backend` change.

   Module ES sans dépendance :
     import { createStore, autosave, pickJSONFile } from './lib/save.js?v=1.7.0'
     const store = createStore({
       game: 'kingvi',
       debug: new URLSearchParams(location.search).has('debug'),
       entries: {
         save:  { version: 3, migrations: { 1: d => ({ ...d, wolves: [] }), 2: d => d } },
         meta:  { version: 1 },               // progression permanente (roguelite)
         prefs: { version: 1, debugWrites: false, defaults: { musique: 70, effets: 80 } },
       },
       secret: ['gh-token'],                  // jamais exportées
     })
     store.load('save')           // → données migrées, ou null (ou `defaults`)
     store.save('save', data)
     store.clear('save')
     const stop = autosave(() => store.save('save', game.snapshot()), { everyMs: 10000 })
     downloadJSON(store.exportAll(), 'kingvi-sauvegarde.json')   // (app-update.js)
     store.importAll(await pickJSONFile())
   Une migration `n` transforme une donnée de version n en version n + 1.
   ─────────────────────────────────────────────────────────────────────────── */

function localBackend() {
  return {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } },
    remove(k) { try { localStorage.removeItem(k); } catch { /* rien */ } },
    keys() { try { return Object.keys(localStorage); } catch { return []; } },
  };
}

export function memoryBackend(init = {}) {
  const m = new Map(Object.entries(init));
  return {
    get: k => (m.has(k) ? m.get(k) : null),
    set: (k, v) => { m.set(k, String(v)); return true; },
    remove: k => { m.delete(k); },
    keys: () => [...m.keys()],
  };
}

export function createStore({
  game,
  entries = {},
  debug = false,
  secret = [],
  backend = (typeof localStorage !== 'undefined' ? localBackend() : memoryBackend()),
} = {}) {
  if (!game) throw new Error('createStore : le nom du jeu (game) est obligatoire');
  const prefix = debug ? `${game}:debug:` : `${game}:`;
  const keyOf = name => prefix + name;
  const spec = name => entries[name] || { version: 1 };
  const clone = v => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

  function migrate(name, wrapped) {
    const { version = 1, migrations = {} } = spec(name);
    let v = wrapped.v ?? 1;
    let data = wrapped.data;
    if (v > version) {
      // Sauvegarde venue d'une version plus récente du jeu : on la lit telle quelle.
      console.warn(`[save] ${name} : version ${v} plus récente que ${version}`);
      return data;
    }
    while (v < version) {
      const step = migrations[v];
      if (!step) throw new Error(`[save] ${name} : migration ${v} → ${v + 1} manquante`);
      data = step(data);
      v++;
    }
    return data;
  }

  const store = {
    prefix,
    load(name) {
      const raw = backend.get(keyOf(name));
      const s = spec(name);
      if (raw == null) return s.defaults !== undefined ? clone(s.defaults) : null;
      try {
        const parsed = JSON.parse(raw);
        // Une donnée écrite sans enveloppe (ancien jeu) est lue comme la version 1
        const wrapped = parsed && typeof parsed === 'object' && 'v' in parsed && 'data' in parsed
          ? parsed : { v: 1, data: parsed };
        const data = migrate(name, wrapped);
        return s.defaults && data && typeof data === 'object' && !Array.isArray(data)
          ? { ...clone(s.defaults), ...data } : data;
      } catch (e) {
        console.error(`[save] ${name} illisible`, e);
        return s.defaults !== undefined ? clone(s.defaults) : null;
      }
    },
    save(name, data) {
      const s = spec(name);
      if (debug && s.debugWrites === false) return false;
      return backend.set(keyOf(name), JSON.stringify({ v: s.version || 1, at: Date.now(), data }));
    },
    clear(name) { backend.remove(keyOf(name)); },
    has(name) { return backend.get(keyOf(name)) != null; },
    // Tout ce que le jeu a écrit (hors secrets), pour l'export des réglages
    exportAll() {
      const out = { game, exportedAt: new Date().toISOString(), entries: {} };
      for (const k of backend.keys()) {
        if (!k.startsWith(prefix)) continue;
        const name = k.slice(prefix.length);
        if (secret.includes(name) || (!debug && name.startsWith('debug:'))) continue;
        try { out.entries[name] = JSON.parse(backend.get(k)); } catch { /* ignorée */ }
      }
      return out;
    },
    importAll(dump) {
      if (!dump || dump.game !== game || typeof dump.entries !== 'object') {
        throw new Error(`Ce fichier n'est pas une sauvegarde de ${game}.`);
      }
      let n = 0;
      for (const [name, value] of Object.entries(dump.entries)) {
        if (secret.includes(name)) continue;
        backend.set(keyOf(name), JSON.stringify(value));
        n++;
      }
      return n;
    },
    // Les secrets (jeton de l'atelier) : jamais exportés
    getSecret(name) { return backend.get(keyOf(name)) || ''; },
    setSecret(name, value) { value ? backend.set(keyOf(name), value) : backend.remove(keyOf(name)); },
  };
  return store;
}

// Sauvegarde régulière et à la fermeture. `write` doit être rapide et synchrone.
export function autosave(write, { everyMs = 10000 } = {}) {
  const safe = () => { try { write(); } catch (e) { console.error('[save] autosave', e); } };
  const onHide = () => { if (document.visibilityState === 'hidden') safe(); };
  const timer = everyMs ? setInterval(safe, everyMs) : null;
  window.addEventListener('pagehide', safe);
  document.addEventListener('visibilitychange', onHide);
  return () => {
    clearInterval(timer);
    window.removeEventListener('pagehide', safe);
    document.removeEventListener('visibilitychange', onHide);
  };
}

// Ouvre le sélecteur de fichier et rend le JSON choisi (import des réglages)
export function pickJSONFile() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return reject(new Error('Aucun fichier.'));
      try { resolve(JSON.parse(await file.text())); } catch { reject(new Error('Fichier illisible.')); }
    };
    input.click();
  });
}
