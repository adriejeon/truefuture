import { createClient } from '@supabase/supabase-js'

// 환경 변수에서 Supabase 설정 가져오기
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// 환경 변수 확인
if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Supabase 환경 변수가 설정되지 않았습니다.')
  console.error('VITE_SUPABASE_URL:', supabaseUrl ? '설정됨' : '누락')
  console.error('VITE_SUPABASE_ANON_KEY:', supabaseAnonKey ? '설정됨' : '누락')
}

// Supabase 클라이언트 인스턴스 생성
// 환경 변수가 없어도 빌드는 되도록 하되, 런타임에서 에러가 발생할 수 있음
export const supabase = supabaseUrl && supabaseAnonKey 
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null
