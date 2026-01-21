/**
 * 인앱 브라우저 감지 및 외부 브라우저로 리다이렉트하는 유틸리티
 */

/**
 * 현재 브라우저가 인앱 브라우저인지 확인
 * @returns {Object} { isInApp: boolean, appName: string | null }
 */
export const detectInAppBrowser = () => {
  const userAgent = navigator.userAgent || navigator.vendor || window.opera;
  const ua = userAgent.toLowerCase();

  // 카카오톡
  if (ua.includes('kakaotalk')) {
    return { isInApp: true, appName: 'KakaoTalk' };
  }

  // 네이버
  if (ua.includes('naver')) {
    return { isInApp: true, appName: 'Naver' };
  }

  // 인스타그램
  if (ua.includes('instagram')) {
    return { isInApp: true, appName: 'Instagram' };
  }

  // 페이스북
  if (ua.includes('fban') || ua.includes('fbav')) {
    return { isInApp: true, appName: 'Facebook' };
  }

  // 라인
  if (ua.includes('line')) {
    return { isInApp: true, appName: 'Line' };
  }

  // 웨이보
  if (ua.includes('weibo')) {
    return { isInApp: true, appName: 'Weibo' };
  }

  // 다음 앱
  if (ua.includes('daumapps')) {
    return { isInApp: true, appName: 'Daum' };
  }

  return { isInApp: false, appName: null };
};

/**
 * 외부 브라우저로 리다이렉트 시도
 * @param {string} appName - 앱 이름
 * @param {string} url - 리다이렉트할 URL
 * @returns {boolean} 리다이렉트 시도 성공 여부
 */
export const redirectToExternalBrowser = (appName, url) => {
  const currentUrl = url || window.location.href;

  try {
    switch (appName) {
      case 'KakaoTalk':
        // 카카오톡에서 외부 브라우저로 열기
        window.location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent(currentUrl)}`;
        return true;

      case 'Naver':
        // 네이버 앱에서 외부 브라우저로 열기
        window.location.href = `naversearchapp://web?url=${encodeURIComponent(currentUrl)}`;
        return true;

      case 'Instagram':
      case 'Facebook':
      case 'Line':
      case 'Weibo':
      case 'Daum':
        // 직접 리다이렉트가 어려운 앱들은 안내 메시지만 표시
        return false;

      default:
        return false;
    }
  } catch (error) {
    console.error('외부 브라우저 리다이렉트 실패:', error);
    return false;
  }
};

/**
 * 외부 브라우저로 열기 안내 메시지 생성
 * @param {string} appName - 앱 이름
 * @returns {string} 안내 메시지
 */
export const getBrowserGuideMessage = (appName) => {
  const messages = {
    KakaoTalk: '카카오톡 인앱 브라우저에서는 Google 로그인이 제한됩니다. 더 원활한 사용을 위해 우측 상단의 "..." 메뉴에서 "다른 브라우저로 열기"를 선택해주세요.',
    Naver: '네이버 인앱 브라우저에서는 Google 로그인이 제한됩니다. 더 원활한 사용을 위해 우측 상단의 "..." 메뉴에서 "다른 브라우저로 열기"를 선택해주세요.',
    Instagram: '인스타그램 인앱 브라우저에서는 Google 로그인이 제한됩니다. 더 원활한 사용을 위해 우측 상단의 "..." 메뉴에서 "Safari로 열기" 또는 "Chrome으로 열기"를 선택해주세요.',
    Facebook: '페이스북 인앱 브라우저에서는 Google 로그인이 제한됩니다. 더 원활한 사용을 위해 우측 상단의 "..." 메뉴에서 "Safari로 열기" 또는 "Chrome으로 열기"를 선택해주세요.',
    Line: '라인 인앱 브라우저에서는 Google 로그인이 제한됩니다. 더 원활한 사용을 위해 우측 상단의 "..." 메뉴에서 "다른 브라우저로 열기"를 선택해주세요.',
    Weibo: '웨이보 인앱 브라우저에서는 Google 로그인이 제한됩니다. 더 원활한 사용을 위해 외부 브라우저로 열어주세요.',
    Daum: '다음 앱 인앱 브라우저에서는 Google 로그인이 제한됩니다. 더 원활한 사용을 위해 외부 브라우저로 열어주세요.',
  };

  return messages[appName] || '인앱 브라우저에서는 Google 로그인이 제한됩니다. 더 원활한 사용을 위해 외부 브라우저로 열어주세요.';
};
