import {readFile,readdir} from 'node:fs/promises';import {createHash} from 'node:crypto';import {getDatabase} from '../lib/database.js';
export async function migrate(db){
  await db.prepare('CREATE TABLE IF NOT EXISTS aa_migrations (name TEXT PRIMARY KEY NOT NULL, hash TEXT NOT NULL, applied_at INTEGER NOT NULL)').run();
  for(const name of(await readdir(new URL('../drizzle/',import.meta.url))).filter(n=>n.endsWith('.sql')).sort()){
    const sql=await readFile(new URL('../drizzle/'+name,import.meta.url),'utf8'),hash=createHash('sha256').update(sql).digest('hex');
    const previous=await db.prepare('SELECT hash FROM aa_migrations WHERE name=?').bind(name).first();
    if(previous){if(previous.hash!==hash)throw Error('Applied migration changed: '+name);continue;}
    const statements=sql.split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean).map(s=>db.prepare(s));
    statements.push(db.prepare('INSERT INTO aa_migrations (name,hash,applied_at) VALUES (?,?,?)').bind(name,hash,Date.now()));await db.batch(statements);
  }
}
if(process.argv[1]&&new URL(import.meta.url).pathname===process.argv[1]){const db=getDatabase();if(!db)throw Error('Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN to migrate your database.');await migrate(db);console.log('Database migrations applied.');db.client.close();}
