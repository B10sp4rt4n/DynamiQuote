// Creates and restores a source checkpoint from one immutable local commit.
// Does not connect to services, migrate data, install dependencies or deploy.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const [revision, destination] = process.argv.slice(2);
if (!revision || !/^[0-9a-f]{40}$/.test(revision) || !destination || !path.isAbsolute(destination)) {
  throw new Error('Usage: node scripts/prepare_crm_recovery.mjs <full-commit-sha> <new-absolute-output-directory>');
}
if (existsSync(destination)) throw new Error('Destination must not exist');
const git = (...args) => execFileSync('git', args, { cwd: root, maxBuffer: 64 * 1024 * 1024 });
const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const commit = git('rev-parse', `${revision}^{commit}`).toString().trim();
if (commit !== revision) throw new Error('Exact commit required');
const tree = git('rev-parse', `${commit}^{tree}`).toString().trim();
const files = git('ls-tree', '-rz', '--name-only', commit).toString().split('\0').filter(Boolean);
for (const name of files) {
  if (/(^|\/)\.env($|\.)/.test(name) && !/\.env\.example$/.test(name)) {
    throw new Error(`Tracked environment file needs separate review: ${name}`);
  }
}
mkdirSync(destination, { mode: 0o700 });
const archive = path.join(destination, 'source.tar');
git('archive', '--format=tar', `--output=${archive}`, commit);
const restored = path.join(destination, 'restored');
mkdirSync(restored, { mode: 0o700 });
execFileSync('tar', ['-xf', archive, '-C', restored]);
const fileHashes = {};
for (const name of files) {
  const expected = sha256(git('show', `${commit}:${name}`));
  const actual = sha256(readFileSync(path.join(restored, name)));
  if (actual !== expected) throw new Error(`Restored source mismatch: ${name}`);
  fileHashes[name] = expected;
}
const manifest = {
  schema_version: 1, commit, tree, source_archive_sha256: sha256(readFileSync(archive)),
  verified_files: files.length, restored_source_verified: true,
  dependencies_included: false, build_included: false, database_backup_included: false,
  production_rollback_tested: false, file_sha256: fileHashes,
};
writeFileSync(path.join(destination, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 });
console.log(JSON.stringify({ commit, tree, verified_files: files.length, restored_source_verified: true }));
