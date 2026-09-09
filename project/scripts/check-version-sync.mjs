#!/usr/bin/env node
/**
 * check-version-sync.mjs — R3(출시 엔지니어링) E2.
 *
 * `.agents/AGENTS.md` §2 「코드 커밋 = 4파일 동시 버전업」을 기계가 지키게 한다.
 * package.json · Cargo.toml · tauri.conf.json · Cargo.lock 네 곳의 버전이 전부
 * 같은지 본다. 불일치면 네 값을 전부 출력하고 exit 1 — 「어디가 틀렸나」를
 * 사람이 다시 찾게 하지 않는다.
 *
 * 부가 모드: 첫 인자로 태그(예: v0.9.27 또는 0.9.27)를 주면, 네 파일 값과
 * 그 태그도 함께 비교한다(E1 릴리스 워크플로에서 재사용 — §3.2 스크립트 재사용).
 *
 * 실행: node scripts/check-version-sync.mjs [tag]
 * cwd 는 project/ 여야 한다(package.json 이 있는 위치).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

function read(relPath) {
  return readFileSync(path.join(projectRoot, relPath), 'utf-8');
}

function extractPackageJsonVersion() {
  const json = JSON.parse(read('package.json'));
  return json.version;
}

function extractTauriConfVersion() {
  const json = JSON.parse(read('src-tauri/tauri.conf.json'));
  return json.version;
}

function extractCargoTomlVersion() {
  const text = read('src-tauri/Cargo.toml');
  const m = text.match(/^version\s*=\s*"([^"]+)"/m);
  return m ? m[1] : null;
}

function extractCargoLockVersion() {
  const text = read('src-tauri/Cargo.lock');
  // [[package]] 블록 중 name = "devoras" 바로 다음에 오는 version 값을 찾는다.
  const m = text.match(/name = "devoras"\nversion = "([^"]+)"/);
  return m ? m[1] : null;
}

function main() {
  const tagArg = process.argv[2] ?? null;
  const tagVersion = tagArg ? tagArg.replace(/^v/, '') : null;

  const values = {
    'package.json': extractPackageJsonVersion(),
    'src-tauri/Cargo.toml': extractCargoTomlVersion(),
    'src-tauri/tauri.conf.json': extractTauriConfVersion(),
    'src-tauri/Cargo.lock (devoras)': extractCargoLockVersion(),
  };
  if (tagVersion !== null) {
    values[`git tag (${tagArg})`] = tagVersion;
  }

  const entries = Object.entries(values);
  const missing = entries.filter(([, v]) => !v);
  const unique = new Set(entries.map(([, v]) => v));

  if (missing.length > 0 || unique.size > 1) {
    console.error('❌ 버전 불일치 (또는 값을 읽지 못함) — 전체 값:');
    for (const [file, v] of entries) {
      console.error(`  ${file.padEnd(32)} = ${v ?? '(읽기 실패)'}`);
    }
    process.exit(1);
  }

  console.log(`✅ 버전 동기 확인 — 전부 ${entries[0][1]}`);
  for (const [file, v] of entries) {
    console.log(`  ${file.padEnd(32)} = ${v}`);
  }
}

main();
