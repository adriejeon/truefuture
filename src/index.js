/**
 * True Future - 서양 점성술 서비스 백엔드
 * Cloudflare Workers 기반
 */

// Polyfills를 가장 먼저 로드
import './polyfills.js';

import { calculateChart } from './utils/astroCalculator.js';
import { getInterpretation } from './utils/aiInterpreter.js';

/**
 * CORS 헤더 설정
 * @param {Request} request - 요청 객체
 * @returns {Object} CORS 헤더 객체
 */
function getCorsHeaders(request) {
  const origin = request.headers.get('Origin');
  
  // 허용할 도메인 목록 (필요에 따라 수정)
  const allowedOrigins = [
    'https://*.github.io',
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:8080',
  ];

  // GitHub Pages 도메인 체크 (예: username.github.io)
  const isGitHubPages = origin && /^https:\/\/[a-zA-Z0-9-]+\.github\.io$/.test(origin);
  
  // 허용된 도메인인지 확인
  const isAllowed = allowedOrigins.some(allowed => {
    if (allowed.includes('*')) {
      const pattern = new RegExp(allowed.replace('*', '.*'));
      return pattern.test(origin);
    }
    return origin === allowed;
  });

  // Origin이 없거나 허용된 도메인이면 해당 Origin 사용, 아니면 null
  const allowedOrigin = (origin && (isAllowed || isGitHubPages)) ? origin : '*';

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

/**
 * OPTIONS 요청 처리 (CORS preflight)
 * @param {Request} request - 요청 객체
 * @returns {Response} CORS 응답
 */
function handleOptions(request) {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(request),
  });
}

/**
 * 에러 응답 생성
 * @param {string} message - 에러 메시지
 * @param {number} status - HTTP 상태 코드
 * @param {Request} request - 요청 객체
 * @returns {Response} 에러 응답
 */
function errorResponse(message, status = 400, request) {
  return new Response(
    JSON.stringify({
      success: false,
      error: true,
      message: message,
    }),
    {
      status: status,
      headers: {
        'Content-Type': 'application/json',
        ...getCorsHeaders(request),
      },
    }
  );
}

/**
 * 성공 응답 생성
 * @param {Object} data - 응답 데이터
 * @param {Request} request - 요청 객체
 * @returns {Response} 성공 응답
 */
function successResponse(data, request) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      ...getCorsHeaders(request),
    },
  });
}

/**
 * 해석 결과를 Supabase에 저장 (비동기, fetch API 사용)
 * Cloudflare Workers 호환성을 위해 Supabase REST API를 직접 호출
 * @param {Object} env - 환경 변수 객체
 * @param {Object} chartData - 차트 데이터
 * @param {Object} interpretation - AI 해석 결과
 * @param {Object} requestData - 요청 데이터
 */
async function saveToSupabase(env, chartData, interpretation, requestData) {
  // Supabase 자격 증명 확인
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    console.warn('Supabase credentials not provided. Skipping database operations.');
    return;
  }

  try {
    // Supabase REST API 엔드포인트
    const supabaseUrl = env.SUPABASE_URL.replace(/\/$/, ''); // 마지막 슬래시 제거
    const apiUrl = `${supabaseUrl}/rest/v1/readings`;

    // 요청 본문 데이터
    const insertData = {
      birth_date: requestData.birthDate,
      latitude: requestData.lat,
      longitude: requestData.lng,
      report_type: requestData.reportType || 'daily',
      chart_data: chartData,
      interpretation: interpretation.interpretation || interpretation,
      created_at: new Date().toISOString(),
    };

    // Supabase REST API 호출
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': env.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${env.SUPABASE_ANON_KEY}`,
        'Prefer': 'return=minimal', // 응답 최소화
      },
      body: JSON.stringify(insertData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Supabase insert error:', response.status, errorText);
    } else {
      console.log('Successfully saved reading to Supabase');
    }
  } catch (error) {
    console.error('Error saving to Supabase:', error);
  }
}

/**
 * POST /api/calculate 엔드포인트 처리
 * @param {Request} request - 요청 객체
 * @param {Object} env - 환경 변수 객체
 * @param {ExecutionContext} ctx - 실행 컨텍스트
 * @returns {Promise<Response>} 응답 객체
 */
async function handleCalculate(request, env, ctx) {
  try {
    // 요청 본문 파싱
    const requestData = await request.json();

    // 필수 필드 검증
    const { birthDate, lat, lng, reportType = 'daily' } = requestData;

    if (!birthDate) {
      return errorResponse('birthDate is required', 400, request);
    }

    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return errorResponse('lat and lng must be numbers', 400, request);
    }

    // 생년월일을 Date 객체로 변환
    let birthDateTime;
    try {
      // ISO 형식 (YYYY-MM-DD 또는 YYYY-MM-DDTHH:mm:ss) 지원
      birthDateTime = new Date(birthDate);
      if (isNaN(birthDateTime.getTime())) {
        throw new Error('Invalid date format');
      }
    } catch (error) {
      return errorResponse(
        'Invalid birthDate format. Use ISO format (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss)',
        400,
        request
      );
    }

    // 1단계: 점성술 차트 계산
    const chartData = await calculateChart(birthDateTime, lat, lng);

    if (chartData.error) {
      return errorResponse(
        `Chart calculation failed: ${chartData.message}`,
        500,
        request
      );
    }

    // 2단계: AI 해석 요청
    const interpretation = await getInterpretation(chartData, reportType, env);

    if (!interpretation.success || interpretation.error) {
      return errorResponse(
        `AI interpretation failed: ${interpretation.message || 'Unknown error'}`,
        500,
        request
      );
    }

    // 3단계: Supabase에 저장 (비동기, 응답을 기다리지 않음)
    if (env.SUPABASE_URL && env.SUPABASE_ANON_KEY) {
      ctx.waitUntil(
        saveToSupabase(env, chartData, interpretation, {
          birthDate: birthDate,
          lat: lat,
          lng: lng,
          reportType: reportType,
        })
      );
    }

    // 성공 응답 반환
    return successResponse(
      {
        success: true,
        chart: chartData,
        interpretation: interpretation.interpretation,
        reportType: reportType,
      },
      request
    );
  } catch (error) {
    console.error('Error in handleCalculate:', error);
    return errorResponse(
      `Internal server error: ${error.message}`,
      500,
      request
    );
  }
}

/**
 * 메인 fetch 핸들러
 * @param {Request} request - 요청 객체
 * @param {Object} env - 환경 변수 객체
 * @param {ExecutionContext} ctx - 실행 컨텍스트
 * @returns {Promise<Response>} 응답 객체
 */
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // CORS preflight 요청 처리
    if (method === 'OPTIONS') {
      return handleOptions(request);
    }

    // 경로별 라우팅
    if (path === '/api/calculate' && method === 'POST') {
      return handleCalculate(request, env, ctx);
    }

    // 루트 경로: 서비스 정보 반환
    if (path === '/' && method === 'GET') {
      return successResponse(
        {
          service: 'True Future',
          version: '1.0.0',
          endpoints: {
            'POST /api/calculate': 'Calculate astrological chart and get AI interpretation',
          },
        },
        request
      );
    }

    // 404 Not Found
    return errorResponse('Not Found', 404, request);
  },
};
