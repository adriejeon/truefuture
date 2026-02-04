import { useState, useCallback, useEffect, cloneElement, isValidElement, Children } from "react";
import TypewriterLoader from "./TypewriterLoader";

const MODAL_EXIT_DURATION = 400;
const STREAM_REVEAL_DELAY_MS = 50;

/**
 * FortuneProcess
 * 운세 확인하기 버튼 클릭부터 최종 결과 노출까지 4단계 상태를 관리합니다.
 *
 * [상태 1] idle   - 트리거(버튼)만 표시. 클릭 시 onRequest 호출 후 loading 으로 전환.
 * [상태 2] loading - 모달 + TypewriterLoader. API 응답 시 ready 로 전환.
 * [상태 3] ready  - 같은 모달 안에 "운명의 조각들이 모두 맞춰졌습니다." + "진짜미래 확인하기" 버튼.
 * [상태 4] view   - 모달 페이드아웃 후, 결과를 스트리밍처럼 순차 노출.
 */
function FortuneProcess({ children, onRequest, renderResult, readyButtonText = "진짜미래 확인하기" }) {
  const [status, setStatus] = useState("idle");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [modalExiting, setModalExiting] = useState(false);

  const handleStart = useCallback(() => {
    setError("");
    setStatus("loading");
    Promise.resolve(onRequest())
      .then((data) => {
        setResult(data);
        setStatus("ready");
      })
      .catch((err) => {
        setError(err?.message || "요청 중 오류가 발생했습니다.");
        setStatus("idle");
      });
  }, [onRequest]);

  const handleShowResult = useCallback(() => {
    setModalExiting(true);
    setStatus("view");
  }, []);

  // 모달 페이드아웃 애니메이션 종료 후 모달 언마운트
  useEffect(() => {
    if (!modalExiting || status !== "view") return;
    const t = setTimeout(() => setModalExiting(false), MODAL_EXIT_DURATION);
    return () => clearTimeout(t);
  }, [modalExiting, status]);

  // ---------- 상태 1: idle ----------
  if (status === "idle") {
    const trigger =
      isValidElement(children) && children.props?.onClick == null
        ? cloneElement(children, { onClick: handleStart })
        : children;
    return (
      <>
        {trigger}
        {error && (
          <div className="mt-4 p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-200 text-sm">
            {error}
          </div>
        )}
      </>
    );
  }

  // ---------- 모달: loading / ready / view(페이드아웃 중) ----------
  const showModal = status === "loading" || status === "ready" || modalExiting;
  if (showModal) {
    const isExiting = modalExiting && status === "view";
    const modalContent =
      status === "loading" ? (
        <>
          <TypewriterLoader />
          <p className="mt-4 text-center text-slate-400 text-sm">잠시만 기다려 주세요...</p>
        </>
      ) : (
        <>
          <p className="text-slate-200 text-lg sm:text-xl text-center mb-6">
            운명의 조각들이 모두 맞춰졌습니다.
          </p>
          <button
            type="button"
            onClick={handleShowResult}
            disabled={isExiting}
            className="w-full py-3.5 px-6 text-lg text-white font-semibold rounded-lg shadow-lg transition-all duration-300 hover:shadow-[0_0_12px_rgba(97,72,235,0.4),0_0_16px_rgba(255,82,82,0.3)] disabled:opacity-70"
            style={{
              background:
                "linear-gradient(to right, #6148EB 0%, #6148EB 40%, #FF5252 70%, #F56265 100%)",
            }}
          >
            {readyButtonText}
          </button>
        </>
      );

    return (
      <>
        <div
          className={`fixed inset-0 z-[10001] flex items-center justify-center bg-black/70 p-4 ${
            isExiting ? "fortune-modal-exit" : ""
          }`}
          role="dialog"
          aria-modal="true"
          aria-label={status === "loading" ? "운세 생성 중" : "결과 확인"}
        >
          <div
            className="w-full max-w-md rounded-xl border border-slate-600/60 p-6 sm:p-8 shadow-2xl"
            style={{ backgroundColor: "rgba(15, 15, 43, 0.95)" }}
          >
            {modalContent}
          </div>
        </div>
        {/* view 전환 직후부터 결과 영역을 아래에 렌더 (모달이 위에 겹쳐 있음) */}
        {status === "view" && result && (
          <FortuneResultStreaming result={result} renderResult={renderResult} />
        )}
      </>
    );
  }

  // ---------- 상태 4: view (모달 사라진 뒤 결과만) ----------
  if (status === "view" && result) {
    return (
      <FortuneResultStreaming result={result} renderResult={renderResult} />
    );
  }

  return null;
}

/**
 * renderResult(result)를 스트리밍처럼 순차 노출 (각 블록이 짧은 간격으로 슉슉 나타남)
 */
function FortuneResultStreaming({ result, renderResult }) {
  const content = renderResult(result);
  if (!content) return null;

  const children = isValidElement(content) && content.props?.children != null
    ? Children.toArray(content.props.children)
    : [content];

  const wrappedChildren = children.map((child, i) => (
    <div
      key={i}
      className="fortune-stream-reveal"
      style={{ animationDelay: `${i * STREAM_REVEAL_DELAY_MS}ms` }}
    >
      {child}
    </div>
  ));

  if (isValidElement(content) && content.props?.className != null) {
    return cloneElement(content, {}, wrappedChildren);
  }

  return (
    <div className="mb-6 sm:mb-8">
      {wrappedChildren}
    </div>
  );
}

export default FortuneProcess;
