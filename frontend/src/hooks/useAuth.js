import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'

export function useAuth() {
  const [user, setUser] = useState(null)
  const [loadingAuth, setLoadingAuth] = useState(true)

  useEffect(() => {
    if (!supabase) {
      console.error('Supabase 클라이언트가 초기화되지 않았습니다.')
      setLoadingAuth(false)
      return
    }

    // 현재 세션 확인
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoadingAuth(false)
    })

    // 인증 상태 변경 감지
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      setLoadingAuth(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  const logout = async () => {
    if (!supabase) {
      console.error('Supabase 클라이언트가 초기화되지 않았습니다.')
      return
    }
    try {
      await supabase.auth.signOut()
      setUser(null)
    } catch (error) {
      console.error('로그아웃 오류:', error.message)
    }
  }

  return { user, loadingAuth, logout }
}
