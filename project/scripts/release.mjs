#!/usr/bin/env node
/**
 * release.mjs — R3(출시 엔지니어링) E1'. 로컬 릴리스 스크립트.
 *
 * Actions 를 쓰지 않는다(IMPL_PLAN_R3_RELEASE_ENGINEERING.md §0) — 이 앱은 로컬
 * 실행 앱이고 GitHub 은 저장용이다. `gh` CLI 로 로컬에서 태그·릴리스·업로드까지
 * 한 번에 한다.
 *
 * 절차:
 *   1. 인자로 받은 태그(v0.9.x)와 4파일 버전 일치 검사 — check-version-sync.mjs 재사용
 *   2. git 워킹 트리가 clean 한지 확인(미커밋 상태로 릴리스하지 않는다)
 *   3. pnpm tauri build
 *   4. .dmg 경로 확인 + sha256 계산 → SHA256SUMS.txt
 *   5. gh 인증돼 있으면 gh release create 로 태그·릴리스·업로드
 *      인증 안 돼 있으면 산출물 경로·sha256 을 출력하고 정상 종료(exit 0) —
 *      업로드는 사람이 한다. 이 스크립트의 값은 "빌드와 체크섬이 재현 가능해지는 것"이지
 *      업로드 자동화가 아니다.
 *
 * 실행: node scripts/release.mjs v0.9.30
 * cwd 는 project/ 여야 한다.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

function run(cmd, args, opts = {}) {
  console.log(`$ ${cmd} ${args.join(' ')}`);
  const result = spawnSync(cmd, args, {
    cwd: projectRoot,
    stdio: 'inherit',
    ...opts,
  });
  if (result.status !== 0) {
    console.error(`❌ 실패: ${cmd} ${args.join(' ')} (exit ${result.status})`);
    process.exit(result.status ?? 1);
  }
}

function fail(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

function main() {
  const tag = process.argv[2];
  if (!tag) {
    fail('사용법: node scripts/release.mjs <tag>  (예: v0.9.30)');
  }

  // ── 1. 태그·4파일 버전 일치 검사 — check-version-sync.mjs 재사용 ──────────
  console.log('── 1. 버전 동기 검사 ──');
  const syncResult = spawnSync('node', ['scripts/check-version-sync.mjs', tag], {
    cwd: projectRoot,
    stdio: 'inherit',
  });
  if (syncResult.status !== 0) {
    fail(`태그(${tag})와 4파일 버전이 어긋난다. 위 출력을 확인할 것.`);
  }

  // ── 2. git 워킹 트리 clean 확인 ────────────────────────────────────────
  console.log('\n── 2. git 워킹 트리 확인 ──');
  const gitStatus = execFileSync('git', ['status', '--porcelain'], {
    cwd: path.resolve(projectRoot, '..'),
    encoding: 'utf-8',
  });
  if (gitStatus.trim() !== '') {
    console.error(gitStatus);
    fail('워킹 트리가 clean 하지 않다 — 미커밋 상태로 릴리스하지 않는다.');
  }
  console.log('✅ clean');

  // ── 3. 빌드 ────────────────────────────────────────────────────────────
  console.log('\n── 3. pnpm tauri build ──');
  run('pnpm', ['tauri', 'build']);

  // ── 4. .dmg 탐색 + sha256 ─────────────────────────────────────────────
  console.log('\n── 4. .dmg 탐색 + sha256 ──');
  const dmgDir = path.join(projectRoot, 'src-tauri/target/release/bundle/dmg');
  if (!existsSync(dmgDir)) {
    fail(`.dmg 디렉터리가 없다: ${dmgDir}`);
  }
  const dmgFiles = readdirSync(dmgDir).filter((f) => f.endsWith('.dmg'));
  if (dmgFiles.length === 0) {
    fail(`.dmg 를 못 찾았다: ${dmgDir}`);
  }
  if (dmgFiles.length > 1) {
    console.warn(`⚠️ .dmg 가 ${dmgFiles.length}개 있다 — 첫 번째를 쓴다: ${dmgFiles.join(', ')}`);
  }
  const dmgName = dmgFiles[0];
  const dmgPath = path.join(dmgDir, dmgName);

  const hash = createHash('sha256');
  hash.update(readFileSync(dmgPath));
  const sha256 = hash.digest('hex');
  const sumsLine = `${sha256}  ${dmgName}\n`;
  const sumsPath = path.join(projectRoot, 'SHA256SUMS.txt');
  writeFileSync(sumsPath, sumsLine);

  console.log(`  경로: ${dmgPath}`);
  console.log(`  sha256: ${sha256}`);
  console.log(`  → ${sumsPath}`);

  // ── 5. gh release create (인증돼 있을 때만) ───────────────────────────
  console.log('\n── 5. GitHub Release ──');
  const ghAuth = spawnSync('gh', ['auth', 'status'], { cwd: projectRoot, stdio: 'pipe' });
  if (ghAuth.status !== 0) {
    console.log('gh 미인증 — 업로드는 건너뛴다. 산출물 경로와 sha256 은 위 출력을 참고할 것.');
    console.log('✅ 빌드·체크섬 완료 (업로드는 사람이 gh 인증 후 수행).');
    process.exit(0);
  }

  run('gh', [
    'release', 'create', tag,
    '--title', tag,
    '--generate-notes',
    dmgPath,
    sumsPath,
  ]);

  console.log(`\n✅ 릴리스 ${tag} 발행 완료.`);
}

main();
