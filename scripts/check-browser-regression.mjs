import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Local preflight and evidence completeness only; this does not drive a browser.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ids = ['D1', 'D2', 'D3', 'D4', 'P1', 'C1', 'C2', 'C3', 'G1', 'G2', 'G3'];
const hash = data => createHash('sha256').update(data).digest('hex');
const readJSON = path => JSON.parse(readFileSync(path, 'utf8'));
const [mode = 'preflight', input] = process.argv.slice(2);

if (mode === 'preflight') {
  const build = realpathSync(resolve(root, input || '.output/chrome-mv3'));
  const manifestBytes = readFileSync(resolve(build, 'manifest.json'));
  const manifest = JSON.parse(manifestBytes);
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.version, readJSON(resolve(root, 'package.json')).version);
  assert.equal(manifest.name, 'View HEIC');
  const files = [manifest.background?.service_worker, manifest.action?.default_popup,
    'converter.html', ...manifest.content_scripts.flatMap(script => script.js)];
  for (const file of files) {
    assert.equal(typeof file, 'string');
    const artifact = realpathSync(resolve(build, file));
    const artifactRelative = relative(build, artifact);
    assert.ok(!isAbsolute(file) && !isAbsolute(artifactRelative)
      && artifactRelative !== '..' && !artifactRelative.startsWith(`..${sep}`),
    `Build artifact must remain inside the build directory: ${file}`);
    const stats = statSync(artifact);
    assert.ok(stats.isFile() && stats.size > 0, `Build artifact must be a nonempty file: ${file}`);
  }
  const fixture = 'docs/samples/heic-still.heic';
  const bytes = readFileSync(resolve(root, fixture));
  assert.equal(bytes.toString('ascii', 4, 8), 'ftyp', 'Fixture must have an ISO BMFF header');
  console.log(JSON.stringify({
    commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    dirty: Boolean(execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim()),
    build, version: manifest.version, manifestSha256: hash(manifestBytes),
    permissions: manifest.permissions, hostPermissions: manifest.host_permissions,
    contentScriptMatches: manifest.content_scripts.map(script => script.matches),
    fixture, fixtureSha256: hash(bytes), fixtureBytes: bytes.length,
    notice: 'Preflight only. Installation, UI behavior, and original-profile permissions require observation.',
  }, null, 2));
} else if (mode === 'report') {
  assert.ok(input, 'Usage: node scripts/check-browser-regression.mjs report report.json');
  const path = resolve(input);
  const report = readJSON(path);
  assert.match(report.commit, /^[a-f0-9]{40}$/);
  assert.match(report.fixtureSha256, /^[a-f0-9]{64}$/);
  assert.equal(typeof report.profile, 'string');
  assert.ok(report.profile.trim());
  assert.equal(typeof report.candidateInstalled, 'boolean');
  assert.equal(report.cases.length, ids.length);
  assert.deepEqual(report.cases.map(item => item.id).sort(), [...ids].sort());
  for (const item of report.cases) {
    assert.ok(['pass', 'fail', 'blocked'].includes(item.status), item.id);
    assert.ok(typeof item.observation === 'string' && item.observation.trim(), item.id);
    assert.ok(Array.isArray(item.evidence) && item.evidence.length > 0, item.id);
    for (const evidence of item.evidence) {
      const stats = statSync(resolve(dirname(path), evidence));
      assert.ok(stats.isFile() && stats.size > 0, `${item.id}: evidence must be a nonempty file`);
    }
    if (item.status === 'pass') {
      assert.equal(report.candidateInstalled, true, 'Cannot pass without confirmed candidate installation');
      if (/^[CG]/.test(item.id)) {
        for (const field of ['convertingToast', 'convertedToast', 'jpegAttachment', 'noSiteError', 'attachmentRemoved']) {
          assert.equal(item[field], true, `${item.id}: ${field} not observed`);
        }
      }
    }
  }
  const incomplete = report.cases.filter(item => item.status !== 'pass');
  console.log(`Report structure valid. ${ids.length - incomplete.length}/${ids.length} observed passes.`);
  if (incomplete.length) {
    console.log(incomplete.map(item => `${item.id}: ${item.status}`).join('\n'));
    process.exitCode = 2;
  }
} else {
  throw new Error(`Unknown mode: ${mode}`);
}
