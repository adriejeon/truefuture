import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'

export function useAuth() {
  const [user, setUser] = useState(null)
  const [loadingAuth, setLoadingAuth] = useState(true)
  const isInitialized = useRef(false)

  useEffect(() => {
    if (!supabase) {
      console.error('Supabase 클라이언트가 초기화되지 않았습니다.')
      setLoadingAuth(false)
      return
    }

    // onAuthStateChange만 사용하여 인증 상태 관리 (Supabase 권장 패턴)
    // 이 함수는 초기 세션 확인과 이후 상태 변경을 모두 처리합니다
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const newUser = session?.user ?? null
      
      // 로그아웃 감지: 사용자가 null이 되었을 때 생년월일 정보 초기화
      if (!newUser) {
        localStorage.removeItem('birth_info_me')
        localStorage.removeItem('birth_info_partner')
      }
      
      // 중복 상태 업데이트 방지: 동일한 유저 ID면 상태 업데이트 안 함
      setUser((currentUser) => {
        if (currentUser?.id === newUser?.id) {
          return currentUser // 동일한 유저면 상태 변경 없음
        }
        return newUser
      })

      // 로딩 상태는 초기화가 완전히 끝난 시점에 딱 한 번만 false로 변경
      if (!isInitialized.current) {
        isInitialized.current = true
        setLoadingAuth(false)
      }
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
      // 로그아웃 시에는 명시적으로 상태 업데이트
      setUser(null)
      
      // 로그아웃 시 생년월일 정보 초기화
      localStorage.removeItem('birth_info_me')
      localStorage.removeItem('birth_info_partner')
    } catch (error) {
      console.error('로그아웃 오류:', error.message)
    }
  }

  return { user, loadingAuth, logout }
}
