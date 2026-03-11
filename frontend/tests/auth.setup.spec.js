// @ts-check
/**
 * 수동 로그인 1회로 Playwright storageState 저장하기
 *
 * 사용 방법:
 * 1) 프론트 서버 실행: `npm run dev`
 * 2) 세션 저장:       `npm run pw:auth`
 *    - 브라우저가 열리면 직접 로그인(카카오/구글 등) 완료
 *    - (중요) 이후 `/consultation`에서 사용할 프로필이 없다면, 앱에서 프로필을 1개 생성/선택까지 해두세요.
 *      (프로필은 계정 데이터로 저장되므로, 한 번만 만들어두면 이후 테스트가 안정적으로 동작합니다.)
 *    - 로그인 완료 후 Playwright Inspector에서 "Resume"을 눌러 계속 진행
 *    - 그러면 `playwright/.auth/user.json`에 쿠키/로컬스토리지 상태가 저장됨
 * 3) 이후 테스트 실행: `npm run pw:test` 또는 `npx playwright test`
 *
 * 참고:
 * - `playwright/.auth/`는 `.gitignore`에 포함되어 있어 세션 파일이 커밋되지 않습니다.
 * - 기본 동작은 "이미 세션 파일이 있으면 setup을 즉시 종료"입니다.
 * - 강제 갱신이 필요하면 `PW_AUTH_REFRESH=1` 환경변수로 실행하세요. (pw:auth 스크립트가 사용)
 */
import { test } from "@playwright/test";
import fs from "node:fs";

/** Playwright 설정과 동일한 storageState 저장 경로 */
const AUTH_FILE = "playwright/.auth/user.json";

test("manual login (save storageState)", async ({ page }) => {
  // 수동 로그인 시간이 길어질 수 있으니 타임아웃을 넉넉히 설정 (10분)
  test.setTimeout(10 * 60 * 1000);

  // 이미 세션 파일이 있고, 강제 갱신 모드가 아니라면 바로 종료 (매번 로그인 방지)
  const shouldRefresh = process.env.PW_AUTH_REFRESH === "1";
  if (!shouldRefresh && fs.existsSync(AUTH_FILE)) {
    return;
  }

  // 로그인 페이지로 이동 (baseURL은 playwright.config.js의 use.baseURL을 사용)
  await page.goto("/login");

  // 여기서 브라우저가 열린 상태로 멈추고, 사용자가 직접 로그인 완료할 시간을 줌
  // 로그인/리다이렉트가 끝난 뒤 Inspector에서 Resume을 누르면 다음 줄로 진행됩니다.
  await page.pause();

  // 현재 브라우저 컨텍스트(쿠키 + 로컬스토리지)를 storageState 파일로 저장
  await page.context().storageState({ path: AUTH_FILE });
});

