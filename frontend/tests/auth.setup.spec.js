// @ts-check
/**
 * Playwright storageState(로그인 세션) 저장
 *
 * 두 가지 방식을 지원한다.
 *  1) 자동: .env 에 VITE_TEST_LOGIN_EMAIL / VITE_TEST_LOGIN_PASSWORD 가 있으면
 *     Supabase 이메일·비밀번호 로그인으로 세션을 만들어 저장한다. (CI·재실행에 안전)
 *  2) 수동: 위 값이 없으면 브라우저를 열어 직접 로그인(카카오/구글)한 뒤 Inspector 의 Resume 을 누른다.
 *
 * 동작 규칙
 *  - 세션 파일이 있고 아직 만료되지 않았으면 아무것도 하지 않는다.
 *  - 만료됐거나 PW_AUTH_REFRESH=1 이면 새로 만든다. (`npm run pw:auth` 가 이 값을 넣는다)
 *  - `/consultation` 테스트가 프로필을 필요로 하므로 계정의 첫 프로필을 selected_profile_id 로 넣어둔다.
 *
 * 참고: `playwright/.auth/` 는 .gitignore 에 있어 세션 파일이 커밋되지 않는다.
 */
import { test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const AUTH_FILE = "playwright/.auth/user.json";
const BASE_URL = "http://localhost:5173";

/** .env 를 읽어 필요한 값만 꺼낸다 (dotenv 의존성 없이) */
function readEnv() {
  const merged = { ...process.env };
  try {
    const raw = fs.readFileSync(path.resolve(".env"), "utf-8");
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !merged[m[1]]) merged[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* .env 가 없으면 process.env 만 사용 */
  }
  return merged;
}

/** 저장된 세션이 아직 살아 있는지 (만료 5분 전이면 갱신 대상) */
function storedSessionIsFresh() {
  try {
    const state = JSON.parse(fs.readFileSync(AUTH_FILE, "utf-8"));
    for (const origin of state.origins || []) {
      for (const item of origin.localStorage || []) {
        if (!item.name.includes("auth-token")) continue;
        const expiresAt = JSON.parse(item.value)?.expires_at;
        if (expiresAt && expiresAt * 1000 > Date.now() + 5 * 60 * 1000) return true;
      }
    }
  } catch {
    /* 파일이 없거나 형식이 다르면 갱신 */
  }
  return false;
}

test("save storageState", async ({ page, context }) => {
  test.setTimeout(10 * 60 * 1000); // 수동 로그인 대비

  const env = readEnv();
  const forceRefresh = env.PW_AUTH_REFRESH === "1";
  if (!forceRefresh && storedSessionIsFresh()) return;

  const supabaseUrl = env.VITE_SUPABASE_URL;
  const anonKey = env.VITE_SUPABASE_ANON_KEY;
  const email = env.VITE_TEST_LOGIN_EMAIL;
  const password = env.VITE_TEST_LOGIN_PASSWORD;

  if (supabaseUrl && anonKey && email && password) {
    // ── 자동 로그인 ──
    const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const session = await res.json();
    if (!res.ok || !session.access_token) {
      throw new Error(
        `테스트 계정 로그인 실패(${res.status}). .env 의 VITE_TEST_LOGIN_* 값을 확인하세요.`
      );
    }

    // 계정의 첫 프로필 (ProfileSelector 가 선택 상태로 시작하도록)
    const profileRes = await fetch(`${supabaseUrl}/rest/v1/profiles?select=id&limit=1`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${session.access_token}` },
    });
    const profiles = profileRes.ok ? await profileRes.json() : [];
    const profileId = profiles?.[0]?.id ?? null;
    if (!profileId) {
      throw new Error("테스트 계정에 프로필이 없습니다. 앱에서 프로필을 1개 만들어 주세요.");
    }

    // supabase-js 가 읽는 localStorage 키: sb-<project-ref>-auth-token
    const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
    await page.goto(BASE_URL);
    await page.evaluate(
      ({ key, value, profileKey, profileValue }) => {
        localStorage.setItem(key, value);
        localStorage.setItem(profileKey, profileValue);
        // 테스트 셀렉터가 한국어 문구를 쓰므로 UI 언어를 고정한다 (i18next 감지값이 en 이 되는 것 방지)
        localStorage.setItem("i18nextLng", "ko");
      },
      {
        key: `sb-${projectRef}-auth-token`,
        value: JSON.stringify(session),
        profileKey: "selected_profile_id",
        profileValue: profileId,
      }
    );
  } else {
    // ── 수동 로그인 ──
    await page.goto(`${BASE_URL}/login`);
    await page.pause(); // 로그인 완료 후 Inspector 에서 Resume
  }

  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
  await context.storageState({ path: AUTH_FILE });
});
