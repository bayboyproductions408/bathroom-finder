/* =====================================================================
   Storage, with two backings behind one async interface.

     local  — node:sqlite, a file on disk. Zero setup, used for tests and
              for running the server on your own machine.
     turso  — libSQL over the network. Survives restarts, which the free
              hosting tier's disk does not.

   Everything is async even on the local driver, so the API code is written
   once and cannot accidentally depend on synchronous behaviour that Turso
   will not provide.

   Choose by environment:
     TURSO_DATABASE_URL=libsql://...   TURSO_AUTH_TOKEN=...
   With neither set it falls back to the local file, and says so.
   ===================================================================== */
'use strict';
const path = require('node:path');
const fs = require('node:fs');

/* ---------- local: node:sqlite ---------- */
function openLocal(file){
  const { DatabaseSync } = require('node:sqlite');
  fs.mkdirSync(path.dirname(file), {recursive:true});
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');

  /* Compiled on first use, not at prepare() time. node:sqlite validates the
     SQL against the live schema when it compiles, so an eager prepare would
     fail on any statement written before its table exists — and it would fail
     only here, never on Turso, where prepare is inherently lazy. Deferring
     makes the two drivers behave identically at startup. */
  const wrap = sql => {
    let stmt = null;
    const s = () => (stmt || (stmt = db.prepare(sql)));
    return {
      async get(...p){ return s().get(...p); },
      async all(...p){ return s().all(...p); },
      async run(...p){ return s().run(...p); }
    };
  };
  return {
    kind: 'local',
    async exec(sql){ db.exec(sql); },
    prepare: wrap,
    async close(){ try { db.close(); } catch(e){} }
  };
}

/* ---------- turso / libSQL ----------
   The client returns rows as arrays with a columns list; normalise to plain
   objects so call sites cannot tell the two drivers apart.            */
function openTurso(url, authToken){
  const { createClient } = require('@libsql/client');
  const client = createClient({url, authToken});

  const toObject = (row, columns) => {
    if (!row) return undefined;
    if (!Array.isArray(row)) return row;              // newer clients already map
    const out = {};
    columns.forEach((c, i) => { out[c] = row[i]; });
    return out;
  };

  const wrap = sql => ({
    async get(...args){
      const res = await client.execute({sql, args});
      return res.rows.length ? toObject(res.rows[0], res.columns) : undefined;
    },
    async all(...args){
      const res = await client.execute({sql, args});
      return res.rows.map(r => toObject(r, res.columns));
    },
    async run(...args){
      const res = await client.execute({sql, args});
      return {changes: Number(res.rowsAffected || 0), lastInsertRowid: res.lastInsertRowid};
    }
  });

  return {
    kind: 'turso',
    async exec(sql){
      /* executeMultiple runs a whole schema script in one round trip */
      if (client.executeMultiple) await client.executeMultiple(sql);
      else for (const s of sql.split(';').map(x => x.trim()).filter(Boolean)) await client.execute(s);
    },
    prepare: wrap,
    async close(){ try { await client.close(); } catch(e){} }
  };
}

/* Whether the libSQL client is installed and loadable — asked before anyone
   sets TURSO_DATABASE_URL, because the answer decides whether setting it
   brings the service up or takes it down. A host that skips the install step
   is otherwise indistinguishable from a healthy one until the moment it
   matters. */
function tursoClientAvailable(){
  try { require.resolve('@libsql/client'); return true; }
  catch(e){ return false; }
}

function openStore({file, url, authToken} = {}){
  const tursoUrl = url || process.env.TURSO_DATABASE_URL;
  const tursoToken = authToken || process.env.TURSO_AUTH_TOKEN;
  if (tursoUrl){
    try {
      const store = openTurso(tursoUrl, tursoToken);
      console.log('storage: turso (durable)');
      return store;
    } catch(err){
      /* Falling back silently would look fine and quietly lose data on the
         next restart, so make the failure loud — and say which of the two
         things went wrong, because the fixes are completely different. */
      const missing = err.code === 'MODULE_NOT_FOUND';
      console.error('\nTURSO_DATABASE_URL is set but storage could not be opened:');
      console.error('  ' + err.message);
      console.error(missing
        ? '\nThe libSQL client is not installed. Run:  npm install @libsql/client'
        : '\nThe client is installed, so this is the URL or the auth token.'
          + '\nCheck TURSO_DATABASE_URL and TURSO_AUTH_TOKEN.');
      console.error('Refusing to fall back to disk, which would lose data on restart.\n');
      process.exit(1);
    }
  }
  console.log('storage: local file (WIPED ON RESTART — set TURSO_DATABASE_URL for durable storage)');
  if (!tursoClientAvailable()){
    /* Say this now, while it is a warning. Discovered later — at the moment
       someone sets TURSO_DATABASE_URL — it is an outage instead. */
    console.log('  note: @libsql/client is not installed here, so setting');
    console.log('        TURSO_DATABASE_URL would fail to start. Run npm install first.');
  }
  return openLocal(file);
}

module.exports = {openStore, openLocal, openTurso, tursoClientAvailable};
