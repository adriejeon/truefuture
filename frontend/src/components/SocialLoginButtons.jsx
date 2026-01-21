import { supabase } from '../lib/supabaseClient'

/**
 * 리디렉션 URL을 환경에 따라 반환하는 헬퍼 함수
 * @returns {string} 환경에 맞는 리디렉션 URL
 */
const getRedirectUrl = () => {
  // Localhost 환경인지 확인
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  
  if (isLocalhost) {
    // 로컬 개발 환경: 포트 번호 포함
    return `http://localhost:5173`
  } else {
    // 프로덕션 환경: GitHub Pages 경로 포함
    return `https://adriejeon.github.io/truefuture/`
  }
}

/**
 * SocialLoginButtons 컴포넌트
 * 
 * Google과 Kakao 소셜 로그인 버튼을 제공하는 컴포넌트입니다.
 * Supabase Auth를 사용하여 OAuth 인증을 처리합니다.
 */
function SocialLoginButtons() {
  /**
   * 소셜 로그인 처리 함수
   * @param {string} provider - 'google' 또는 'kakao'
   */
  const handleSocialLogin = async (provider) => {
    if (!supabase) {
      console.error('Supabase 클라이언트가 초기화되지 않았습니다.')
      alert('로그인 기능을 사용할 수 없습니다. 환경 설정을 확인해주세요.')
      return
    }

    // 환경에 맞는 리디렉션 URL 가져오기
    const redirectUrl = getRedirectUrl()
    console.log('OAuth 리디렉션 URL:', redirectUrl)

    // 프로바이더별로 options 객체 동적 생성
    const options = {
      // 로그인 완료 후 환경에 맞는 URL로 리디렉션
      redirectTo: redirectUrl,
    }

    // 카카오인 경우에만 scopes와 queryParams 추가
    // queryParams를 사용하여 account_email을 명시적으로 제외
    if (provider === 'kakao') {
      options.scopes = 'profile_nickname,profile_image'
      // queryParams로 scope를 명시적으로 지정하여 Supabase가 자동으로 추가하는 account_email을 제외
      options.queryParams = {
        scope: 'profile_nickname,profile_image'
      }
    }

    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: provider,
        options: options,
      })

      if (error) {
        throw error
      }

      // OAuth 페이지로 자동 리디렉션됩니다
      console.log('로그인 시작:', provider)
    } catch (error) {
      console.error(`${provider} 로그인 오류:`, error.message)
      alert(`로그인 중 오류가 발생했습니다: ${error.message}`)
    }
  }

  return (
    <div className="w-full max-w-md mx-auto space-y-2 sm:space-y-3">
      {/* Google 로그인 버튼 */}
      <button
        onClick={() => handleSocialLogin('google')}
        className="w-full flex items-center justify-center gap-2 sm:gap-3 px-4 sm:px-6 py-3 sm:py-3.5 bg-white text-gray-700 font-semibold rounded-xl border border-gray-300 shadow-sm hover:bg-gray-50 hover:shadow-md active:scale-[0.98] transition-all duration-200 text-sm sm:text-base touch-manipulation"
      >
        {/* Google G 로고 SVG */}
        <svg
          width="18"
          height="18"
          className="sm:w-5 sm:h-5"
          viewBox="0 0 48 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M47.532 24.5528C47.532 22.9214 47.3997 21.2811 47.1175 19.6761H24.48V28.9181H37.4434C36.9055 31.8988 35.177 34.5356 32.6461 36.2111V42.2078H40.3801C44.9217 38.0278 47.532 31.8547 47.532 24.5528Z"
            fill="#4285F4"
          />
          <path
            d="M24.48 48.0016C30.9529 48.0016 36.4116 45.8764 40.3888 42.2078L32.6549 36.2111C30.5031 37.675 27.7252 38.5039 24.4888 38.5039C18.2275 38.5039 12.9187 34.2798 11.0139 28.6006H3.03296V34.7825C7.10718 42.8868 15.4056 48.0016 24.48 48.0016Z"
            fill="#34A853"
          />
          <path
            d="M11.0051 28.6006C9.99973 25.6199 9.99973 22.3922 11.0051 19.4115V13.2296H3.03298C-0.371021 20.0112 -0.371021 28.0009 3.03298 34.7825L11.0051 28.6006Z"
            fill="#FBBC04"
          />
          <path
            d="M24.48 9.49932C27.9016 9.44641 31.2086 10.7339 33.6866 13.0973L40.5387 6.24523C36.2 2.17101 30.4414 -0.068932 24.48 0.00161733C15.4055 0.00161733 7.10718 5.11644 3.03296 13.2296L11.005 19.4115C12.901 13.7235 18.2187 9.49932 24.48 9.49932Z"
            fill="#EA4335"
          />
        </svg>
        <span className="whitespace-nowrap">Google 계정으로 계속하기</span>
      </button>

      {/* Kakao 로그인 버튼 */}
      <button
        onClick={() => handleSocialLogin('kakao')}
        className="w-full flex items-center justify-center gap-2 sm:gap-3 px-4 sm:px-6 py-3 sm:py-3.5 font-semibold rounded-xl shadow-sm hover:opacity-90 active:scale-[0.98] transition-all duration-200 text-sm sm:text-base touch-manipulation"
        style={{ backgroundColor: '#FEE500', color: '#000000' }}
      >
        {/* Kakao 로고 SVG */}
        <svg
          width="18"
          height="18"
          className="sm:w-5 sm:h-5"
          viewBox="0 0 48 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M24 10C14.059 10 6 16.267 6 24c0 4.853 3.15 9.12 7.912 11.557-.326 1.204-1.063 3.933-1.181 4.558-.14.756.28.745.596.542.252-.163 4.044-2.71 5.681-3.805C20.002 36.95 21.976 37.5 24 37.5c9.941 0 18-6.267 18-14S33.941 10 24 10z"
            fill="#000000"
          />
        </svg>
        <span className="whitespace-nowrap">카카오로 1초 만에 시작하기</span>
      </button>
    </div>
  )
}

export default SocialLoginButtons
