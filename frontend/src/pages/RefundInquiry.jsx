import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import DatePicker from "react-datepicker";
import { ko as localeKo } from "date-fns/locale/ko";
import { enUS } from "date-fns/locale/en-US";
import "react-datepicker/dist/react-datepicker.css";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../lib/supabaseClient";

function formatLocalDateTime(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

function RefundInquiry() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [paymentAmount, setPaymentAmount] = useState("");
  const [productName, setProductName] = useState("");
  const [paymentDate, setPaymentDate] = useState(null);
  const [transactionId, setTransactionId] = useState(searchParams.get("transactionId") || "");
  const [refundReason, setRefundReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const dateFnsLocale = i18n.language?.startsWith("ko") ? localeKo : enUS;

  useEffect(() => {
    const txId = searchParams.get("transactionId");
    const date = searchParams.get("purchaseDate");

    if (txId) {
      setTransactionId(txId);
    }
    if (date && /^\d{4}-\d{2}-\d{2}/.test(date)) {
      const ymd = date.slice(0, 10);
      setPaymentDate(new Date(`${ymd}T00:00:00`));
    }
  }, [searchParams]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!paymentAmount.trim()) {
      alert(t("refund_inquiry.error_amount"));
      return;
    }

    if (!productName.trim()) {
      alert(t("refund_inquiry.error_product"));
      return;
    }

    if (!paymentDate || Number.isNaN(paymentDate.getTime())) {
      alert(t("refund_inquiry.error_datetime"));
      return;
    }

    const dt = formatLocalDateTime(paymentDate);

    setIsSubmitting(true);

    try {
      const { data, error } = await supabase.functions.invoke("send-email", {
        body: {
          to: "jupiteradrie@gmail.com",
          subject: `[환불 문의] ${user?.email || "알 수 없음"}`,
          type: "refund",
          content: {
            userEmail: user?.email || "알 수 없음",
            userName: user?.user_metadata?.full_name || user?.email || "알 수 없음",
            paymentMethod: "국내카드 결제",
            paymentAmount: paymentAmount.trim(),
            productName: productName.trim(),
            paymentDateTime: dt,
            transactionId: transactionId || "미입력",
            refundReason: refundReason.trim() || "미입력",
          },
        },
      });

      if (error) throw error;

      if (!data?.success) {
        throw new Error(data?.error || t("refund_inquiry.error_send"));
      }

      alert(t("refund_inquiry.success"));
      navigate("/mypage");
    } catch (err) {
      console.error("환불 문의 오류:", err);
      alert(err.message || t("refund_inquiry.error_send"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen py-8 px-4 bg-white">
      <div className="max-w-md mx-auto">
        <div className="mb-8">
          <button
            onClick={() => navigate(-1)}
            className="mb-4 flex items-center text-gray-600 hover:text-gray-900 transition-colors"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            {t("refund_inquiry.back")}
          </button>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{t("refund_inquiry.title")}</h1>
        </div>

        <div className="bg-yellow-100 border border-yellow-300 rounded-lg p-4 mb-6">
          <ul className="space-y-2 text-sm text-gray-800">
            <li className="flex items-start">
              <span className="mr-2">✓</span>
              <span>{t("refund_inquiry.policy_1")}</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2 text-red-500">✗</span>
              <span>{t("refund_inquiry.policy_2")}</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2">✓</span>
              <span>{t("refund_inquiry.policy_3", { days: 7 })}</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2">✓</span>
              <span>{t("refund_inquiry.policy_4")}</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2">✓</span>
              <span>{t("refund_inquiry.policy_5")}</span>
            </li>
          </ul>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label className="block text-gray-900 font-medium mb-2">
              {t("refund_inquiry.amount_label")} <span className="text-red-600">*</span>
            </label>
            <input
              type="text"
              value={paymentAmount}
              onChange={(e) => setPaymentAmount(e.target.value)}
              placeholder={t("refund_inquiry.amount_placeholder")}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-yellow-500 bg-white"
              required
            />
          </div>

          <div>
            <label className="block text-gray-900 font-medium mb-2">
              {t("refund_inquiry.product_label")} <span className="text-red-600">*</span>
            </label>
            <input
              type="text"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder={t("refund_inquiry.product_placeholder")}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-yellow-500 bg-white"
              required
            />
          </div>

          <div>
            <label className="block text-gray-900 font-medium mb-2">
              {t("refund_inquiry.datetime_label")} <span className="text-red-600">*</span>
            </label>
            <p className="text-xs text-gray-600 mb-2">
              {t("refund_inquiry.datetime_hint")}
            </p>
            <DatePicker
              selected={paymentDate}
              onChange={(date) => setPaymentDate(date)}
              showTimeSelect
              timeIntervals={1}
              dateFormat="Pp"
              locale={dateFnsLocale}
              placeholderText={t("refund_inquiry.datetime_placeholder")}
              timeCaption={t("refund_inquiry.time_caption")}
              autoComplete="off"
              wrapperClassName="w-full block"
              popperClassName="refund-datepicker-popper z-[200]"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-yellow-500 bg-white"
            />
          </div>

          {transactionId && (
            <div>
              <label className="block text-gray-900 font-medium mb-2">
                {t("refund_inquiry.tx_id_label")}
              </label>
              <input
                type="text"
                value={transactionId}
                readOnly
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-600 bg-gray-100 cursor-not-allowed"
              />
            </div>
          )}

          <div>
            <label className="block text-gray-900 font-medium mb-2">{t("refund_inquiry.reason_label")}</label>
            <textarea
              value={refundReason}
              onChange={(e) => setRefundReason(e.target.value)}
              placeholder={t("refund_inquiry.reason_placeholder")}
              rows={4}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-yellow-500 resize-none bg-white"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-yellow-400 hover:bg-yellow-500 disabled:bg-yellow-300 text-gray-900 font-bold py-4 text-lg rounded-lg transition-colors"
          >
            {isSubmitting ? t("refund_inquiry.submitting") : t("refund_inquiry.submit_btn")}
          </button>
        </form>
      </div>
    </div>
  );
}

export default RefundInquiry;
