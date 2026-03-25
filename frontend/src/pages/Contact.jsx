import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../lib/supabaseClient";
import PrimaryButton from "../components/PrimaryButton";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function Contact() {
  const { t } = useTranslation();
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
      alert(t("contact.subject_required"));
      return;
    }

    const trimmedReply = replyEmail.trim();
    if (!trimmedReply || !EMAIL_REGEX.test(trimmedReply)) {
      setEmailError(t("contact.email_error"));
      return;
    }

    if (!message.trim()) {
      alert(t("contact.message_required"));
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
        throw new Error(data?.error || t("contact.email_send_fail"));
      }

      alert(t("contact.send_success"));
      navigate("/mypage");
    } catch (err) {
      console.error("문의하기 오류:", err);
      alert(err.message || t("contact.send_error"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen py-8 px-4">
      <div className="max-w-md mx-auto">
        <div className="mb-8">
          <button
            onClick={() => navigate(-1)}
            className="mb-4 flex items-center text-slate-300 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            {t("contact.back")}
          </button>
          <h1 className="text-2xl font-bold text-white mb-2">{t("contact.title")}</h1>
          <p className="text-slate-300 text-sm">
            {t("contact.subtitle")}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6" noValidate>
          <div>
            <label className="block text-white font-medium mb-2">
              {t("contact.email_label")} <span className="text-red-400">*</span>
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
              placeholder={t("contact.email_placeholder")}
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
            <label className="block text-white font-medium mb-2">{t("contact.subject_label")}</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={t("contact.subject_placeholder")}
              className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-white font-medium mb-2">{t("contact.message_label")}</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t("contact.message_placeholder")}
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
            {isSubmitting ? t("common.sending") : t("common.send")}
          </PrimaryButton>
        </form>
      </div>
    </div>
  );
}

export default Contact;
