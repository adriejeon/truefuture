// @ts-check
/**
 * 운세권 차감 에러 방지 — API 실패 시 프론트 방어 동작 E2E 테스트
 *
 * 목적: 망원경을 쓰고 운세 생성이 실패했을 때, 사용자가 "운세권만 날렸다"고 느끼지 않도록
 *       앱이 (1) 결과 복구를 먼저 확인하고 (2) 그래도 실패하면 오류를 화면에 알리고
 *       (3) 로딩에 갇히지 않고 다시 시도할 수 있는 상태로 돌아오는지 검증한다.
 *       실제 환불은 서버(get-fortune)가 처리하므로 여기서는 프론트 방어만 본다.
 *
 * - 시나리오 1: get-fortune 500 → 복구 확인 후 오류 표시, 로딩 해제
 * - 시나리오 2: 스트림 중간 끊김(abort) → 복구 확인 후 오류 표시, 로딩 해제
 * - 시나리오 3: 생성 중 새로고침 / 뒤로가기 → 크래시 없이 복구 가능한 상태
 *
 * 테스트 환경: http://localhost:5173 (`npm run dev`)
 * 전제: tests/auth.setup.spec.js 가 저장한 로그인 세션 + 계정에 프로필 1개 이상.
 *       운세권 잔액은 아래에서 모킹하므로 실제 잔액이 0이어도 된다(운영 DB를 건드리지 않는다).
 */
import { test, expect } from "@playwright/test";

const GET_FORTUNE_PATH = "/functions/v1/get-fortune";
/** 잔액 조회 RPC — 실제 지갑에 의존하지 않도록 충분한 망원경을 준다 */
const VALID_STARS_RPC = "**/rest/v1/rpc/get_valid_stars";

/** 실패 시 화면에 뜨는 안내 문구 (Consultation.jsx onError) */
const RECOVERY_NOTICE = /생성 결과를 확인하고 있습니다/;

test.use({ storageState: "playwright/.auth/user.json" });

/** 잔액 조회를 모킹해 차감 확인 모달이 항상 열리게 한다 */
async function mockStarBalance(page, paid = 5) {
  await page.route(VALID_STARS_RPC, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        { paid_stars: paid, bonus_stars: 0, probe_stars: 0, total_stars: paid },
      ]),
    });
  });
}

/**
 * 자유 질문 폼을 채우고 차감 확인 모달의 '사용' 버튼을 반환한다.
 * 각 시나리오는 이 버튼을 누르기 전에 get-fortune route 를 설정해 둔다.
 * (카테고리 선택 UI 는 2026-09-02 커밋 795bc9b 에서 제거됐다 — 질문만 쓰면 서버가 해석법을 고른다)
 */
async function openConsultationAndStarModal(page) {
  await page.goto("/consultation");

  const textarea = page.getByPlaceholder(/구체적으로 질문할수록/);
  await expect(textarea, "로그인 세션이 유효해야 질문 입력창이 보인다").toBeVisible({
    timeout: 15000,
  });
  await textarea.fill("API 오류 시뮬레이션용 테스트 질문입니다.");

  // 프로필 드롭다운 열고 첫 프로필 선택
  await page.locator("div.relative.w-full button").first().click();
  await page.locator("div.absolute.top-full button").first().click({ timeout: 5000 });

  const submitButton = page.getByRole("button", { name: "진짜미래 확인" });
  await expect(submitButton).toBeEnabled({ timeout: 15000 });
  await submitButton.click();

  const useButton = page.getByTestId("star-modal-confirm");
  await expect(useButton, "잔액이 충분하면 '사용' 버튼이 있는 확인 모달이 열린다").toBeVisible({
    timeout: 15000,
  });
  return useButton;
}

/**
 * 실패 후 앱이 도달해야 하는 상태: 복구 확인 → 오류 표시 → 다시 시도 가능.
 * 오류 문구는 서버가 내려준 원문이 그대로 표시될 수 있으므로 특정 문장 대신
 * 오류 영역이 비어 있지 않은지로 검증한다.
 */
async function expectFailureHandled(page) {
  await expect(page.getByTestId("consultation-notice")).toHaveText(RECOVERY_NOTICE, {
    timeout: 20000,
  });
  const errorBox = page.getByTestId("consultation-error");
  await expect(errorBox, "실패하면 오류 안내가 화면에 남아야 한다").toBeVisible({ timeout: 30000 });
  await expect(errorBox).not.toBeEmpty();
  await expect(
    page.getByRole("button", { name: "진짜미래 확인" }),
    "다시 시도할 수 있는 상태로 돌아와야 한다"
  ).toBeEnabled({ timeout: 15000 });
}

test.describe("운세권 차감 에러 방지 — API 실패 시 프론트 방어", () => {
  test.beforeEach(async ({ page }) => {
    await mockStarBalance(page);
  });

  test("시나리오 1: get-fortune 500 → 복구 확인 후 오류 표시", async ({ page }) => {
    test.setTimeout(90000); // 지연 + 복구 확인 3초 대기

    await page.route("**" + GET_FORTUNE_PATH, async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Internal Server Error" }),
      });
    });

    const useButton = await openConsultationAndStarModal(page);
    await useButton.click();

    await expectFailureHandled(page);
  });

  test("시나리오 2: 스트림 중간 끊김 → 복구 확인 후 오류 표시", async ({ page }) => {
    test.setTimeout(90000);

    await page.route("**" + GET_FORTUNE_PATH, async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      await route.abort("failed");
    });

    const useButton = await openConsultationAndStarModal(page);
    await useButton.click();

    await expectFailureHandled(page);
  });

  test("시나리오 3: 생성 중 새로고침 시 크래시 없이 복구 가능", async ({ page }) => {
    test.setTimeout(90000);

    // 응답을 주지 않아 '생성 중' 상태를 유지시킨다
    await page.route("**" + GET_FORTUNE_PATH, async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      await new Promise(() => {});
    });

    const useButton = await openConsultationAndStarModal(page);
    await useButton.click();

    await page.waitForTimeout(1500);
    await page.reload();

    await expect(page).toHaveURL(/\/consultation/, { timeout: 15000 });
    await expect(page.getByPlaceholder(/구체적으로 질문할수록/)).toBeVisible({ timeout: 15000 });
  });

  test("시나리오 3-b: 생성 중 뒤로가기 시 크래시 없이 복구 가능", async ({ page }) => {
    test.setTimeout(90000);

    await page.route("**" + GET_FORTUNE_PATH, async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      await new Promise(() => {});
    });

    const useButton = await openConsultationAndStarModal(page);
    await useButton.click();

    await page.waitForTimeout(1500);
    await page.goBack();
    await page.goto("/consultation");

    await expect(page.getByPlaceholder(/구체적으로 질문할수록/)).toBeVisible({ timeout: 15000 });
  });
});
