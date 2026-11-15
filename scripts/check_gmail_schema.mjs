/** Disposable PostgreSQL WASM schema checks; never uses DATABASE_URL or an external database. */
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const {PGlite}=await import(process.env.PGLITE_MODULE||"@electric-sql/pglite");
const db=new PGlite();
try {
  await db.exec(`CREATE TABLE tenants(tenant_id text PRIMARY KEY);CREATE TABLE app_users(user_id text PRIMARY KEY);
    CREATE TABLE clients(client_id text PRIMARY KEY,tenant_id text NOT NULL);
    CREATE TABLE opportunities(opportunity_id text PRIMARY KEY,tenant_id text NOT NULL,client_id text NOT NULL);`);
  const sql=await readFile(new URL("../cotiza-web/prisma/manual/20261115_gmail_context.sql",import.meta.url),"utf8");
  await db.exec(sql);await db.exec(sql);
  await db.exec(`INSERT INTO tenants VALUES('one'),('two');INSERT INTO app_users VALUES('actor'),('other');
    INSERT INTO clients VALUES('client-one','one'),('client-two','two');
    INSERT INTO opportunities VALUES('opp-one','one','client-one'),('opp-two','two','client-two'),('opp-next','one','client-one');
    INSERT INTO gmail_connections(tenant_id,actor_id,email_address,oauth_client_id,credentials,expires_at,status)
      VALUES('one','actor','reader@example.test','synthetic','encrypted',now(),'connected');`);
  await assert.rejects(db.exec(`INSERT INTO gmail_connections(tenant_id,actor_id,email_address,oauth_client_id,expires_at,status)
    VALUES('two','other','reader@example.test','synthetic',now(),'connected');`),/unique/i);
  await db.query(`INSERT INTO gmail_message_copies(copy_id,tenant_id,actor_id,email_address,message_id,snapshot_hash,encrypted_archive)
    VALUES('copy-one','one','actor','reader@example.test','abc1',$1,'encrypted'),('copy-two','one','actor','reader@example.test','abc2',$1,'encrypted')`,['a'.repeat(64)]);
  await db.exec(`INSERT INTO gmail_opportunity_links(link_id,tenant_id,actor_id,client_id,opportunity_id,copy_id)
    VALUES('link-one','one','actor','client-one','opp-one','copy-one'),('link-two','one','actor','client-one','opp-one','copy-two');`);
  await assert.rejects(db.exec(`INSERT INTO gmail_opportunity_links(link_id,tenant_id,actor_id,client_id,opportunity_id,copy_id)
    VALUES('foreign','two','other','client-two','opp-two','copy-one');`),/foreign key/i);
  await assert.rejects(db.exec(`INSERT INTO gmail_opportunity_links(link_id,tenant_id,actor_id,client_id,opportunity_id,copy_id)
    VALUES('wrong-client','one','actor','client-one','opp-two','copy-one');`),/foreign key/i);
  await db.exec(`INSERT INTO gmail_opportunity_links(link_id,tenant_id,actor_id,client_id,opportunity_id,copy_id)
    VALUES('same-message-other-case','one','actor','client-one','opp-next','copy-one');`);
  await db.exec(`INSERT INTO gmail_opportunity_links(link_id,tenant_id,actor_id,client_id,opportunity_id,copy_id)
    VALUES('duplicate','one','actor','client-one','opp-one','copy-one') ON CONFLICT(tenant_id,actor_id,opportunity_id,copy_id) DO NOTHING;`);
  const result=await db.query('SELECT count(*)::int n FROM gmail_opportunity_links');assert.equal(result.rows[0].n,3);
  console.log("Gmail schema: idempotent migration, separate messages, multi-case links, mailbox uniqueness, tenant/actor/client FKs and duplicate rejection passed.");
}finally{await db.close();}
