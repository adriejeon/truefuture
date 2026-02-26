import { useState, useCallback, useEffect, useRef } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import BirthInputForm from "../components/BirthInputForm";
import BottomNavigation from "../components/BottomNavigation";
import FortuneResult from "../components/FortuneResult";
import SocialLoginButtons from "../components/SocialLoginButtons";
import ProfileSelector from "../components/ProfileSelector";
import ProfileModal from "../components/ProfileModal";
import TypewriterLoader from "../components/TypewriterLoader";
import PrimaryButton from "../components/PrimaryButton";
import StarModal from "../components/StarModal";
import OrderCheckModal from "../components/OrderCheckModal";
import { useAuth } from "../hooks/useAuth";
import { useProfiles } from "../hooks/useProfiles";
import { supabase } from "../lib/supabaseClient";
import { restoreFortuneIfExists } from "../services/fortuneService";
import { loadSharedFortune } from "../utils/sharedFortune";
import { logFortuneInput } from "../utils/debugFortune";
import { invokeGetFortuneStream } from "../utils/getFortuneStream";
import {
  FORTUNE_STAR_COSTS,
  FORTUNE_TYPE_NAMES,
  fetchUserStars,
  consumeStars,
  checkStarBalance,
} from "../utils/starConsumption";
import * as PortOne from "@portone/browser-sdk/v2";
import { prepareBuyerEmail } from "../utils/paymentUtils";
import AstrologyPageHelmet from "../components/AstrologyPageHelmet";

function LifetimeFortune() {
  const { user, loadingAuth } = useAuth();
  const {
    profiles,
    selectedProfile,
    loading: profilesLoading,
    createProfile,
    deleteProfile,
    selectProfile,
    checkFortuneAvailability,
    saveFortuneHistory,
  } = useProfiles();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [interpretation, setInterpretation] = useState("");
  const [loading, setLoading] = useState(false);
  const [processStatus, setProcessStatus] = useState("idle"); // 'idle' | 'waiting' | 'done' (비스트리밍)
  const [error, setError] = useState("");
  const [shareId, setShareId] = useState(null);
  const resultContainerRef = useRef(null);
  const [isSharedFortune, setIsSharedFortune] = useState(false);
  const [sharedUserInfo, setSharedUserInfo] = useState(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showNoProfileModal, setShowNoProfileModal] = useState(false);
  const [restoring, setRestoring] = useState(false);
  // 종합 운세 조회 가능 여부 (null: 미확인, true: 조회 가능, false: 이미 사용함)
  const [canViewLifetime, setCanViewLifetime] = useState(null);
  const [showStarModal, setShowStarModal] = useState(false);
  const [starModalData, setStarModalData] = useState({
    type: "confirm",
    required: FORTUNE_STAR_COSTS.lifetime,
    current: 0,
  });
  const [showOrderModal, setShowOrderModal] = useState(false);

  // URL에 공유 ID가 있는 경우 운세 조회
  useEffect(() => {
    const sharedId = searchParams.get("id");

    if (sharedId) {
      console.log("🔗 공유된 인생 종합운 ID 발견:", sharedId);
      loadShared(sharedId);
    }
  }, [searchParams]);

  // 공유된 운세 조회 함수
  const loadShared = async (id) => {
    setLoading(true);
    setError("");

    try {
      const data = await loadSharedFortune(id);

      console.log("✅ 공유된 인생 종합운 조회 성공:", data);
      logFortuneInput(data, { fortuneType: "lifetime" });

      setInterpretation(data.interpretation);
      setIsSharedFortune(true);
      setShareId(id);
      setSharedUserInfo(data.userInfo);
    } catch (err) {
      console.error("❌ 공유된 인생 종합운 조회 실패:", err);
      setError(err.message || "운세를 불러오는 중 오류가 발생했습니다.");
      setSearchParams({});
    } finally {
      setLoading(false);
    }
  };

  // 로그인 필요 액션 처리
  const handleRequireLogin = () => {
    alert("로그인이 필요합니다.");
    navigate("/");
  };

  // 프로필 데이터를 API 형식으로 변환하는 함수
  const convertProfileToApiFormat = (profile) => {
    if (!profile) {
      return null;
    }

    return {
      birthDate: profile.birth_date.substring(0, 19),
      lat: profile.lat,
      lng: profile.lng,
    };
  };

  // 프로필이 없을 때 모달 표시
  useEffect(() => {
    if (
      user &&
      !profilesLoading &&
      profiles.length === 0 &&
      !showNoProfileModal &&
      !isSharedFortune
    ) {
      setShowNoProfileModal(true);
    }
  }, [user, profilesLoading, profiles, showNoProfileModal, isSharedFortune]);

  // 프로필이 생성되면 모달 닫기
  useEffect(() => {
    if (profiles.length > 0) {
      setShowNoProfileModal(false);
      setShowProfileModal(false);
    }
  }, [profiles]);

  // 로그인 계정에 저장된 이전 결과 복구 (다른 기기/새로고침 후에도 결과 유지)
  useEffect(() => {
    if (!selectedProfile || isSharedFortune || !user) return;
    // 공유 링크(id)가 있으면 복구하지 않음
    if (searchParams.get("id")) return;

    // 결제 완료 후 복귀한 경우 자동으로 운세 조회
    const paymentCompleted = searchParams.get("payment_completed");
    if (paymentCompleted === "true") {
      console.log("🎉 결제 완료 후 복귀, 운세 조회 시작");
      // URL 파라미터 제거
      searchParams.delete("payment_completed");
      searchParams.delete("profile_id");
      setSearchParams(searchParams);
      
      // sessionStorage 정리
      try {
        sessionStorage.removeItem("lifetime_profile_id");
        sessionStorage.removeItem("lifetime_payment_pending");
      } catch (_) {}
      
      // 운세 조회 실행
      handleConfirmStarUsage();
      return;
    }

    setRestoring(true);
    let cancelled = false;

    (async () => {
      try {
        const restored = await restoreFortuneIfExists(
          selectedProfile.id,
          "lifetime"
        );
        if (cancelled) return;
        if (restored) {
          console.log("✅ [복구] 인생 종합운 DB에서 복구");
          setInterpretation(restored.interpretation);
          setShareId(restored.shareId);
          setError("");
        } else {
          setInterpretation("");
          setShareId(null);
        }
      } catch (err) {
        if (!cancelled) setError(err.message || "복구 중 오류가 발생했습니다.");
      } finally {
        if (!cancelled) setRestoring(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedProfile?.id, isSharedFortune, user, searchParams]);

  // 프로필 선택 시 종합 운세 조회 가능 여부 체크 (버튼 비활성화용)
  useEffect(() => {
    if (!selectedProfile?.id || !user || isSharedFortune) {
      setCanViewLifetime(null);
      return;
    }
    let cancelled = false;
    checkFortuneAvailability(selectedProfile.id, "lifetime").then((res) => {
      if (!cancelled) setCanViewLifetime(res.available);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedProfile?.id, user, isSharedFortune, checkFortuneAvailability]);

  // 프로필 생성 핸들러
  const handleCreateProfile = useCallback(
    async (profileData) => {
      await createProfile(profileData);
      // 프로필 생성 후 모달은 ProfileModal의 onClose에서 처리됨
    },
    [createProfile]
  );

  const handleSubmit = async (e) => {
    e.preventDefault();

    // 공유 링크로 들어온 경우 로그인 필요
    if (isSharedFortune && !user) {
      handleRequireLogin();
      return;
    }

    // 프로필 선택 체크
    if (!selectedProfile) {
      setError("프로필을 선택해주세요.");
      setShowProfileModal(true);
      return;
    }

    // 운세 조회 가능 여부 체크
    const availability = await checkFortuneAvailability(
      selectedProfile.id,
      "lifetime"
    );
    if (!availability.available) {
      setError(availability.reason);
      return;
    }

    const formData = convertProfileToApiFormat(selectedProfile);

    if (!formData) {
      setError("프로필 정보가 올바르지 않습니다.");
      return;
    }

    // 주문 확인 모달 표시
    setShowOrderModal(true);
    setError("");
  };

  // 주문 확인 모달에서 결제 진행
  const handleConfirmOrder = async () => {
    // 종합 운세 단건 결제 진행
    setLoading(true);
    setError("");

    try {
      const merchantUid = `order_${Date.now()}_${user.id.slice(0, 8)}`;
      
      // 결제 완료 후 복귀할 URL (종합 운세는 바로 /lifetime으로)
      const redirectBase = `${window.location.origin}/lifetime`;
      const redirectUrl = `${redirectBase}?payment_completed=true&profile_id=${selectedProfile.id}&merchant_uid=${encodeURIComponent(merchantUid)}`;
      
      try {
        sessionStorage.setItem("payment_merchant_uid", merchantUid);
        sessionStorage.setItem("lifetime_profile_id", selectedProfile.id);
        sessionStorage.setItem("lifetime_payment_pending", "true");
      } catch (_) {}

      // PortOne 결제 요청
      const response = await PortOne.requestPayment({
        storeId: import.meta.env.VITE_PORTONE_STORE_ID,
        channelKey: import.meta.env.VITE_PORTONE_CHANNEL_KEY,
        paymentId: merchantUid,
        orderName: "진짜미래 종합 운세",
        totalAmount: 2990,
        currency: "CURRENCY_KRW",
        payMethod: "CARD",
        customer: {
          customerId: user.id,
          fullName: "우주탐험가",
          phoneNumber: "010-0000-0000",
          email: prepareBuyerEmail(user),
        },
        redirectUrl: redirectUrl,
      });

      console.log("포트원 결제 응답:", response);

      // 결제 실패 처리
      if (response?.code != null) {
        throw new Error(response.message || "결제에 실패했습니다.");
        setLoading(false);
        return;
      }

      // 결제 성공 → 백엔드 함수 호출하여 종합 운세 구매 기록
      const { data, error: purchaseError } = await supabase.functions.invoke(
        "purchase-stars",
        {
          body: {
            user_id: user.id,
            amount: 2990,
            merchant_uid: merchantUid,
            imp_uid: response?.paymentId || merchantUid,
          },
        },
      );

      if (purchaseError) {
        setLoading(false);
        throw purchaseError;
      }

      if (!data?.success) {
        setLoading(false);
        throw new Error(data?.error || "운세권 구매에 실패했습니다.");
      }

      // 결제 성공 후 운세 조회 진행
      await handleConfirmStarUsage();
    } catch (err) {
      console.error("결제 오류:", err);
      setError(err.message || "결제 처리 중 오류가 발생했습니다.");
      setLoading(false);
    }
  };

  // 결제 완료 후 운세 조회 API 호출
  const handleConfirmStarUsage = async () => {
    if (!user?.id || !selectedProfile) return;

    const formData = convertProfileToApiFormat(selectedProfile);
    if (!formData) {
      setError("프로필 정보가 올바르지 않습니다.");
      return;
    }

    setLoading(true);
    setError("");
    setProcessStatus("waiting");
    setInterpretation("");
    setShareId(null);

    try {
      const requestBody = {
        ...formData,
        fortuneType: "lifetime",
        reportType: "lifetime",
        profileName: selectedProfile?.name || null,
      };
      console.log("\n" + "=".repeat(60));
      console.log("📤 API 요청 전송 데이터");
      console.log("=".repeat(60));
      console.log("전체 요청 본문:", JSON.stringify(requestBody, null, 2));
      console.log("=".repeat(60) + "\n");

      await invokeGetFortuneStream(supabase, requestBody, {
        onChunk: () => {},
        onDone: ({ fullData: data }) => {
          setLoading(false);
          setProcessStatus("done");
          if (!data) return;
          logFortuneInput(data, { fortuneType: "lifetime" });
          if (
            data.share_id &&
            data.share_id !== "undefined" &&
            data.share_id !== null &&
            data.share_id !== "null"
          ) {
            setShareId(data.share_id);
          } else {
            setShareId(null);
          }
          if (data.interpretation && typeof data.interpretation === "string") {
            setInterpretation(data.interpretation);
            saveFortuneHistory(
              selectedProfile.id,
              "lifetime",
              data.share_id ?? undefined
            ).then(() => {});
            setCanViewLifetime(false);
            // interpretation 설정 후 스크롤
            requestAnimationFrame(() => {
              resultContainerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
            });
          } else {
            setInterpretation("결과를 불러올 수 없습니다.");
          }
        },
        onError: (err) => {
          setError(err?.message || "요청 중 오류가 발생했습니다.");
          setLoading(false);
          setProcessStatus("idle");
        },
      });
    } catch (err) {
      setError(err.message || "요청 중 오류가 발생했습니다.");
      setLoading(false);
      setProcessStatus("idle");
    }
  };

  if (loadingAuth) {
    return (
      <div className="w-full flex items-center justify-center py-20">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 sm:h-12 sm:w-12 border-b-2 border-blue-400 mx-auto mb-4"></div>
          <p className="text-slate-400 text-sm sm:text-base">로딩 중...</p>
        </div>
      </div>
    );
  }

  // 공유 링크: 로그인 여부 무관하게 '친구가 공유한 운세 결과'만 표시 (프로필 선택기 없음)
  const sharedId = searchParams.get("id");
  if (sharedId) {
    if (loading) {
      return (
        <div className="w-full flex items-center justify-center py-20">
          <div className="text-center">
            <div className="animate-spin rounded-full h-10 w-10 sm:h-12 sm:w-12 border-b-2 border-blue-400 mx-auto mb-4"></div>
            <p className="text-slate-400 text-sm sm:text-base">
              공유된 운세를 불러오는 중...
            </p>
          </div>
        </div>
      );
    }
    if (isSharedFortune && interpretation) {
      const profileName = sharedUserInfo?.profileName?.trim() || "";
      const sharedTitle = profileName ? `${profileName}님의 진짜 인생이에요` : "진짜 인생이에요";

      return (
        <div
          className="w-full py-8 sm:py-12"
          style={{ position: "relative", zIndex: 1 }}
        >
          <div
            className="w-full max-w-[600px] mx-auto px-4 pb-20 sm:pb-24"
            style={{ position: "relative", zIndex: 1 }}
          >
            <FortuneResult
              title={sharedTitle}
              interpretation={interpretation}
              shareId={shareId}
              isShared={true}
            />

            {!user && (
              <div className="mt-6 bg-slate-800/50 backdrop-blur-sm rounded-lg p-4 sm:p-6 shadow-xl border border-slate-700">
                <p className="text-center text-slate-300 mb-4 text-base">
                  나도 내 운세를 확인하고 싶다면?
                </p>
                <SocialLoginButtons />
              </div>
            )}
          </div>
        </div>
      );
    }
  }

  if (!user && !loadingAuth) {
    navigate("/");
    return null;
  }

  return (
    <div
      className="w-full py-8 sm:py-12"
      style={{ position: "relative", zIndex: 1 }}
    >
      <AstrologyPageHelmet />
      <div
        className="w-full max-w-[600px] mx-auto px-6 pb-20 sm:pb-24"
        style={{ position: "relative", zIndex: 1 }}
      >
        {/* 페이지 소개 - 종합 운세 (Natal Chart) */}
        <div className="mb-6 sm:mb-8">
          <h2 className="text-xl sm:text-2xl font-bold text-white mb-2">
            내 인생 사용 설명서
          </h2>
          <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
            내담자님이 태어난 순간, 별들이 그려낸 고유한 설계도입니다. 내가
            타고난 기질과 잠재력, 그리고 인생의 방향성을 확인하고 나를 가장 잘
            쓰는 방법을 알아보세요.
          </p>
        </div>

        {/* 프로필 선택 드롭다운 - 폼 밖으로 분리 */}
        <div className="mb-6 sm:mb-8">
          <ProfileSelector
            profiles={profiles}
            selectedProfile={selectedProfile}
            onSelectProfile={selectProfile}
            onCreateProfile={() => setShowProfileModal(true)}
            onDeleteProfile={deleteProfile}
            loading={profilesLoading}
          />
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 sm:space-y-6 mb-6 sm:mb-8"
        >
          <PrimaryButton
            type="submit"
            disabled={
              loading ||
              !selectedProfile ||
              canViewLifetime !== true
            }
            fullWidth
          >
            진짜미래 확인
          </PrimaryButton>
          <Link
            to="/faq"
            className="block mt-3 text-center text-sm text-slate-400 hover:text-white transition-colors duration-200"
          >
            궁금한 점이 있으신가요?
          </Link>
        </form>

        {/* 로딩 모달: waiting 상태에서만 */}
        {processStatus === "waiting" && (
          <div
            className="fixed inset-0 z-[10001] flex items-center justify-center typing-modal-backdrop min-h-screen p-4"
            role="dialog"
            aria-modal="true"
            aria-label="운세 분석 중"
          >
            <div className="w-full max-w-md min-h-[300px] flex items-center justify-center">
              <TypewriterLoader />
            </div>
          </div>
        )}

        {error && (
          <div className="mb-4 sm:mb-6 p-3 sm:p-4 text-sm sm:text-base bg-red-900/50 border border-red-700 rounded-lg text-red-200 break-words">
            {error}
          </div>
        )}
        {restoring && !interpretation && (
          <div className="mb-6 py-8 text-center text-slate-400 text-sm">
            이전 결과 불러오는 중...
          </div>
        )}
        {!restoring && interpretation && (
          <div ref={resultContainerRef}>
            <FortuneResult
              title="내 인생 사용 설명서"
              interpretation={interpretation}
              shareId={shareId}
            />
          </div>
        )}
      </div>
      {user && <BottomNavigation activeTab="lifetime" />}

      {/* 별 차감 확인 / 잔액 부족 모달 */}
      <StarModal
        isOpen={showStarModal}
        onClose={() => setShowStarModal(false)}
        type={starModalData.type}
        requiredAmount={starModalData.requiredAmount ?? starModalData.required}
        currentBalance={starModalData.currentBalance ?? starModalData.current}
        onConfirm={handleConfirmStarUsage}
        fortuneType={FORTUNE_TYPE_NAMES.lifetime}
      />

      {/* 프로필 등록 모달 */}
      <ProfileModal
        isOpen={showProfileModal}
        onClose={() => {
          setShowProfileModal(false);
          if (profiles.length === 0 && !isSharedFortune) {
            setShowNoProfileModal(true);
          }
        }}
        onSubmit={handleCreateProfile}
      />

      {/* 프로필 없음 안내 모달 */}
      {showNoProfileModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[10000] p-4">
          <div
            className="bg-[#0F0F2B] rounded-lg shadow-xl max-w-md w-full p-6 border border-slate-700"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center mb-6">
              <div className="w-full flex justify-center mb-4">
                <img
                  src="/assets/welcome.png"
                  alt="진짜미래 고전 점성술 천체 운행 데이터 기반 인생 지도"
                  className="max-w-[100px] h-auto"
                />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">
                환영합니다!
              </h2>
              <p className="text-slate-300">
                운세를 확인하기 위해
                <br />
                생년월일시간을 입력해 주세요
              </p>
            </div>
            <button
              onClick={() => {
                setShowNoProfileModal(false);
                // 약간의 지연을 두어 모달이 완전히 닫힌 후 프로필 등록 모달 열기
                setTimeout(() => {
                  setShowProfileModal(true);
                }, 100);
              }}
              className="w-full py-3 px-4 text-white font-medium rounded-lg transition-all"
              style={{
                background:
                  "linear-gradient(to right, #6148EB 0%, #6148EB 40%, #FF5252 70%, #F56265 100%)",
              }}
            >
              프로필 등록하기
            </button>
          </div>
        </div>
      )}

      {/* 주문 확인 모달 */}
      <OrderCheckModal
        isOpen={showOrderModal}
        onClose={() => setShowOrderModal(false)}
        packageInfo={null}
        onConfirm={handleConfirmOrder}
        loading={loading}
        isLifetimeFortune={true}
      />
    </div>
  );
}

export default LifetimeFortune;
