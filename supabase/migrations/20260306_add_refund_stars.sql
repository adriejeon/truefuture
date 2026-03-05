-- 망원경(운세권) 환불을 위한 RPC 생성
CREATE OR REPLACE FUNCTION refund_stars(p_user_id UUID, p_amount INT, p_description TEXT)
RETURNS void AS $$
BEGIN
  -- 1. 사용자의 지갑에 아이템 개수 다시 더하기
  UPDATE user_wallets
  SET paid_stars = paid_stars + p_amount
  WHERE user_id = p_user_id;

  -- 2. 거래 내역(영수증)에 '환불(REFUND)' 기록 남기기
  INSERT INTO star_transactions (user_id, amount, type, description)
  VALUES (p_user_id, p_amount, 'REFUND', p_description);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;