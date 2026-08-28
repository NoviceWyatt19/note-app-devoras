/**
 * T1 하네스용 TypeScript 로더 훅 (BUG-20260828-03)
 *
 * 왜 필요한가:
 *   원래 T1 스크립트는 `node --experimental-strip-types` 를 썼는데 그 플래그는
 *   **Node 22.6 이상 전용**이라, Node 20 환경에서 `test:image` / `test:symbol` /
 *   K1~K3 하네스가 **전부 즉시 실패**했다(BUG-20260828-03).
 *   런타임은 이후 Node 24 LTS 로 올렸고(`.nvmrc`, `package.json engines`)
 *   Node 22.6+ 는 타입 스트리핑을 기본 제공하므로 그 부분은 더 이상 문제가 아니다.
 *
 *   그럼에도 이 훅을 유지하는 이유는 **타입 스트리핑이 아니라 모듈 해석** 때문이다.
 *   Node 의 기본 스트리핑은 `@/` 별칭도, 확장자 없는 상대 임포트(`../model/store`)도
 *   해석하지 못한다. 하네스들은 둘 다 쓴다. 그래서 훅이 계속 필요하다
 *   (§9.1 이 지적한 "커밋된 하네스가 그대로는 안 돌아간다" 문제의 실제 해법이 이쪽이다).
 *
 * 어떻게 푸는가:
 *   이미 devDependency 인 `typescript` 의 `transpileModule` 로 타입을 벗기고
 *   module customization hook 으로 별칭·확장자를 해석한다. **새 의존성 없음.**
 *   `transpileModule` 은 enum·namespace·파라미터 프로퍼티까지 처리하므로
 *   Node 기본 스트리핑보다 다루는 범위가 넓고, Node 20/24 양쪽에서 동일하게 동작한다.
 */
import { pathToFileURL, fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
const EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs'];

/** 확장자가 없거나 디렉터리를 가리키는 경로를 실제 파일로 확정한다. */
function probe(filePath) {
  if (existsSync(filePath) && statSync(filePath).isFile()) return filePath;
  for (const ext of EXTS) {
    if (existsSync(filePath + ext)) return filePath + ext;
  }
  for (const ext of EXTS) {
    const idx = path.join(filePath, 'index' + ext);
    if (existsSync(idx)) return idx;
  }
  return null;
}

export function resolve(specifier, context, next) {
  // 1) `@/...` 별칭 → src/...
  if (specifier.startsWith('@/')) {
    const hit = probe(path.join(SRC, specifier.slice(2)));
    if (hit) return { url: pathToFileURL(hit).href, format: 'module', shortCircuit: true };
  }
  // 2) 확장자 없는 상대 임포트 (`../model/store`)
  if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
    const base = path.dirname(fileURLToPath(context.parentURL));
    const hit = probe(path.resolve(base, specifier));
    if (hit) return { url: pathToFileURL(hit).href, format: 'module', shortCircuit: true };
  }
  return next(specifier, context);
}

export async function load(url, context, next) {
  if (/\.tsx?$/.test(url) && url.startsWith('file:')) {
    const source = await readFile(fileURLToPath(url), 'utf8');
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
        verbatimModuleSyntax: false,
      },
      fileName: fileURLToPath(url),
    });
    return { format: 'module', source: outputText, shortCircuit: true };
  }
  return next(url, context);
}
