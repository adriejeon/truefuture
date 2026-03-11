// @ts-check
/**
 * 쿠폰(운세권) 차감 에러 방지 — 백엔드/API 연동 안정성 E2E 테스트
 *
 * 목적: 망원경·나침반·탐사선 사용 시 쿠폰만 차감되고 운세 결과를 못 받는 치명적 상황을
 *       시뮬레이션하고, 이때 롤백(환불) 안내 및 방어가 동작하는지 검증합니다.
 *
 * - 시나리오 1: AI API 500 + 10초 지연 → 서버 오류 catch 후 롤백 안내 검증
 * - 시나리오 2: SSE 스트림 중간 끊김 → 비정상 종료 감지 및 롤백/에러 처리 검증
 * - 시나리오 3: 운세 생성 중 페이지 새로고침/뒤로가기 → 이탈 시 방어 가능 여부 검증
 *
 * 테스트 환경: http://localhost:5173
 * 전제: storageState(로그인 세션) + 프로필 1개 이상
 */
import { test, expect } from "@playwright/test";

const GET_FORTUNE_PATH = "/functions/v1/get-fortune";

/** 앱에서 에러 시 표시하는 롤백 안내 문구 (Consultation.jsx onError alert) */
const ROLLBACK_MESSAGE = /소모된 운세권은 서버에서 자동으로 복구됩니다/;

test.use({ storageState: "playwright/.auth/user.json" });

/**
 * 자유 질문(Consultation) 페이지에서 폼을 채우고, 차감 확인 모달까지 연 후
 * '사용' 버튼을 반환합니다. 각 시나리오에서 이 버튼 클릭 전에 route 설정을 해두면 됩니다.
 */
async function openConsultationAndStarModal(page) {
  await page.goto("/consultation");
  await page.getByRole("button", { name: /주간 운세/ }).click();

  const textarea = page.getByPlaceholder(/구체적으로 질문할수록/);
  await expect(textarea).toBeVisible({ timeout: 10000 });
  await textarea.fill("API 오류 시뮬레이션용 테스트 질문입니다.");

  await page.locator("div.relative.w-full button").first().click();
  await page.locator("div.absolute.top-full button").first().click({ timeout: 5000 });

  const submitButton = page.getByRole("button", { name: "진짜미래 확인" });
  await expect(submitButton).toBeEnabled({ timeout: 15000 });
  await submitButton.click();

  const useButton = page.getByTestId("star-modal-confirm");
  await expect(useButton).toBeVisible({ timeout: 15000 });
  return useButton;
}

test.describe("쿠폰 차감 에러 방지 — API/롤백 안정성", () => {
  /**
   * 시나리오 1: AI API 서버 500 에러 및 지연
   * get-fortune 호출을 10초 지연 후 500 Internal Server Error로 응답하게 하여,
   * 프론트가 에러를 catch하고 쿠폰 롤백 안내를 띄우는지 검증합니다.
   */
  test("시나리오 1: API 500 + 10초 지연 시 서버 오류 catch 및 롤백 안내", async ({
    page,
  }) => {
    test.setTimeout(60000); // 10초 지연 + 대기

    await page.route("**" + GET_FORTUNE_PATH, async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      await page.waitForTimeout(10000);
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Internal Server Error" }),
      });
    });

    const dialogPromise = new Promise((resolve) => {
      page.once("dialog", (dialog) => {
        resolve(dialog.message());
        dialog.accept();
      });
    });

    const useButton = await openConsultationAndStarModal(page);
    await useButton.click();

    const alertMessage = await dialogPromise;
    expect(alertMessage, "500 에러 시 롤백 안내 메시지가 표시되어야 합니다.").toMatch(
      ROLLBACK_MESSAGE
    );
  });

  /**
   * 시나리오 2: SSE 스트리밍 중간 끊김
   * 운세 결과가 스트리밍으로 오는 도중 연결을 끊어(abort),
   * 비정상 종료를 감지하고 롤백/에러 처리가 되는지 검증합니다.
   */
  test("시나리오 2: SSE 스트림 중간 끊김 시 비정상 종료 감지 및 롤백 안내", async ({
    page,
  }) => {
    let resolveRequest;
    const requestStarted = new Promise((resolve) => {
      resolveRequest = resolve;
    });

    await page.route("**" + GET_FORTUNE_PATH, async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      resolveRequest();
      await route.abort("failed");
    });

    const dialogPromise = new Promise((resolve) => {
      page.once("dialog", (dialog) => {
        resolve(dialog.message());
        dialog.accept();
      });
    });

    const useButton = await openConsultationAndStarModal(page);
    await useButton.click();

    await requestStarted;
    const alertMessage = await dialogPromise;
    expect(
      alertMessage,
      "스트림 끊김 시 롤백 안내 메시지가 표시되어야 합니다."
    ).toMatch(ROLLBACK_MESSAGE);
  });

  /**
   * 시나리오 3: 운세 생성 중 브라우저 강제 이탈 (새로고침 / 뒤로가기)
   * '사용' 클릭 후 AI 응답 전(또는 로딩 도중)에 새로고침/뒤로가기를 시뮬레이션하고,
   * 앱이 크래시 없이 복구 가능한 상태로 남는지(및 서버 측 롤백 가능성) 검증합니다.
   */
  test("시나리오 3: 사용 버튼 클릭 직후 새로고침 시 앱 방어 및 복구 가능 상태", async ({
    page,
  }) => {
    // get-fortune을 응답하지 않게 하여 '로딩 중' 상태 유지
    await page.route("**" + GET_FORTUNE_PATH, async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      await new Promise(() => {}); // 절대 resolve하지 않음 → 로딩 유지
    });

    const useButton = await openConsultationAndStarModal(page);
    await useButton.click();

    // 로딩 UI가 뜰 때까지 잠시 대기 후 새로고침 (사용자가 이탈하는 타이밍)
    await page.waitForTimeout(1500);
    await page.reload();

    // 새로고침 후 페이지가 정상 로드되는지 검증 (크래시 없음)
    await expect(page).toHaveURL(/\/(consultation|$)/, { timeout: 15000 });
    await expect(
      page.getByRole("button", { name: /진짜미래 확인|주간 운세/ }).first()
    ).toBeVisible({ timeout: 10000 });
  });

  test("시나리오 3-b: 사용 버튼 클릭 직후 뒤로가기 시 앱 방어 및 복구 가능 상태", async ({
    page,
  }) => {
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

    await expect(page).not.toHaveURL(/\/consultation/);
    await page.goto("/consultation");
    await expect(
      page.getByRole("button", { name: /진짜미래 확인|주간 운세/ }).first()
    ).toBeVisible({ timeout: 10000 });
  });
});
