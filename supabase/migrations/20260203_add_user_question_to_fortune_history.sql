-- Add user_question column to fortune_history table for storing consultation questions
ALTER TABLE fortune_history
ADD COLUMN user_question TEXT;

-- Add index for faster queries when filtering by fortune_type
CREATE INDEX IF NOT EXISTS idx_fortune_history_fortune_type ON fortune_history(fortune_type);

-- Add comment
COMMENT ON COLUMN fortune_history.user_question IS 'User question text for consultation fortune type';
