import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../lib/supabaseClient";
import PrimaryButton from "../components/PrimaryButton";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function Contact() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [replyEmail, setReplyEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setEmailError("");

    if (!subject.trim()) {
      alert("제목을 입력해주세요.");
      return;
    }

    const trimmedReply = replyEmail.trim();
    if (!trimmedReply || !EMAIL_REGEX.test(trimmedReply)) {
      setEmailError("정확한 이메일 주소를 입력해 주세요.");
      return;
    }

    if (!message.trim()) {
      alert("문의 내용을 입력해주세요.");
      return;
    }

    setIsSubmitting(true);

    try {
      const { data, error } = await supabase.functions.invoke("send-email", {
        body: {
          to: "jupiteradrie@gmail.com",
          subject: `[문의하기] ${subject}`,
          type: "contact",
          replyTo: trimmedReply,
          message: message.trim(),
          content: {
            userEmail: trimmedReply,
            userName: user?.user_metadata?.full_name || user?.email || "알 수 없음",
            subject: subject.trim(),
            message: message.trim(),
          },
        },
      });

      if (error) throw error;

      if (!data?.success) {
        throw new Error(data?.error || "이메일 전송에 실패했습니다.");
      }

      alert("문의 메일이 전송되었습니다. 빠른 시일 내에 답변드리겠습니다.");
      navigate("/mypage");
    } catch (err) {
      console.error("문의하기 오류:", err);
      alert(err.message || "문의 메일 전송 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen py-8 px-4">
      <div className="max-w-md mx-auto">
        {/* 헤더 */}
        <div className="mb-8">
          <button
            onClick={() => navigate(-1)}
            className="mb-4 flex items-center text-slate-300 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            뒤로
          </button>
          <h1 className="text-2xl font-bold text-white mb-2">문의하기</h1>
          <p className="text-slate-300 text-sm">
            문의사항을 남겨주시면 빠르게 답변드리겠습니다.
          </p>
        </div>

        {/* 문의 폼 */}
        <form onSubmit={handleSubmit} className="space-y-6" noValidate>
          <div>
            <label className="block text-white font-medium mb-2">
              답변 받을 이메일 <span className="text-red-400">*</span>
            </label>
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              value={replyEmail}
              onChange={(e) => {
                setReplyEmail(e.target.value);
                if (emailError) setEmailError("");
              }}
              placeholder="답변 받을 이메일 주소를 입력해 주세요 (예: example@email.com)"
              className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              aria-invalid={!!emailError}
              aria-describedby={emailError ? "contact-email-error" : undefined}
            />
            {emailError && (
              <p
                id="contact-email-error"
                className="mt-2 text-sm text-red-300"
                role="alert"
              >
                {emailError}
              </p>
            )}
          </div>

          <div>
            <label className="block text-white font-medium mb-2">제목</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="문의 제목을 입력해주세요"
              className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-white font-medium mb-2">문의 내용</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="문의 내용을 자세히 입력해주세요"
              rows={8}
              className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-none"
              required
            />
          </div>

          <PrimaryButton
            type="submit"
            variant="gold"
            fullWidth
            disabled={isSubmitting}
          >
            {isSubmitting ? "전송 중..." : "보내기"}
          </PrimaryButton>
        </form>
      </div>
    </div>
  );
}

export default Contact;
