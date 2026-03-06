/** 프로필 등록 유도 모달 "나중에 하기" 선택 여부 (탭 내 페이지 이동 시에도 유지) */
const STORAGE_KEY = "truefuture_profile_modal_dismissed";

export function getProfileModalDismissed() {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setProfileModalDismissed() {
  try {
    sessionStorage.setItem(STORAGE_KEY, "1");
  } catch {}
}

export function clearProfileModalDismissed() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {}
}
