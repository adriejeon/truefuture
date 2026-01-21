/**
 * True Future - AI 해석 유틸리티
 * Google Gemini API를 사용한 점성술 차트 해석
 */

// Gemini API 모델 설정 (무료 할당량 최적화: gemini-2.5-flash-lite - 하루 1,000회 무료)
const GEMINI_MODEL = 'gemini-2.5-flash-lite';
const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * 입력값 유효성 검사
 * @param {Object} chartData - 점성술 계산 결과 JSON 객체
 * @param {string} reportType - 리포트 타입 ('daily', 'yearly', 'synastry' 등)
 * @throws {Error} 유효하지 않은 입력값인 경우
 */
function validateInputs(chartData, reportType) {
  if (!chartData || typeof chartData !== 'object' || chartData.error) {
    throw new Error('Invalid chartData: must be a valid chart calculation result object.');
  }

  if (!reportType || typeof reportType !== 'string') {
    throw new Error('Invalid reportType: must be a string.');
  }

  // 리포트 타입 검증 (선택적)
  const validReportTypes = ['daily', 'yearly', 'synastry', 'monthly', 'weekly', 'general'];
  if (!validReportTypes.includes(reportType.toLowerCase())) {
    console.warn(`Warning: Unknown reportType '${reportType}'. Proceeding anyway.`);
  }
}

/**
 * 리포트 타입에 따른 프롬프트 생성
 * @param {string} reportType - 리포트 타입
 * @returns {string} 리포트 타입 설명
 */
function getReportTypeDescription(reportType) {
  const descriptions = {
    daily: '일일 운세',
    weekly: '주간 운세',
    monthly: '월간 운세',
    yearly: '연간 운세',
    synastry: '합궁(시너스트리) 분석',
    general: '일반 운세',
  };

  return descriptions[reportType.toLowerCase()] || `${reportType} 운세`;
}

/**
 * 차트 데이터를 압축된 텍스트 형식으로 변환 (토큰 절약)
 * @param {Object} chartData - 점성술 계산 결과
 * @returns {string} 압축된 차트 데이터 문자열
 */
function compressChartData(chartData) {
  const parts = [];
  
  // 행성 위치: "Sun:Aries(12deg), Moon:Taurus(4deg), ..."
  // chartData.planets의 키는 소문자이므로 매핑 필요
  const planetMap = {
    sun: 'Sun', moon: 'Moon', mercury: 'Mercury', venus: 'Venus',
    mars: 'Mars', jupiter: 'Jupiter', saturn: 'Saturn',
    uranus: 'Uranus', neptune: 'Neptune', pluto: 'Pluto'
  };
  
  if (chartData.planets) {
    const planetPositions = Object.entries(chartData.planets)
      .filter(([key]) => planetMap[key])
      .map(([key, p]) => {
        const name = planetMap[key];
        const deg = Math.round(p.degreeInSign || 0);
        return `${name}:${p.sign}(${deg}deg)`;
      });
    if (planetPositions.length > 0) {
      parts.push(planetPositions.join(','));
    }
  }
  
  // 상승점: "Asc:Gemini(15deg)"
  if (chartData.houses?.angles?.ascendant !== undefined) {
    const asc = chartData.houses.angles.ascendant;
    const ascSign = getSignFromLongitude(asc);
    const ascDeg = Math.round(ascSign.degreeInSign || 0);
    parts.push(`Asc:${ascSign.sign}(${ascDeg}deg)`);
  }
  
  // 포르투나: "Fort:Libra(8deg)"
  if (chartData.fortuna) {
    const fortDeg = Math.round(chartData.fortuna.degreeInSign || 0);
    parts.push(`Fort:${chartData.fortuna.sign}(${fortDeg}deg)`);
  }
  
  return parts.join(' ');
}

/**
 * 경도에서 별자리 정보 추출 (압축 함수에서 사용)
 * @param {number} longitude - 경도 (0-360)
 * @returns {Object} 별자리 정보
 */
function getSignFromLongitude(longitude) {
  const signs = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 
                 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];
  const signIndex = Math.floor(longitude / 30);
  const degreeInSign = longitude % 30;
  return {
    sign: signs[signIndex],
    degreeInSign: degreeInSign
  };
}

/**
 * 차트 데이터를 기반으로 사용자 프롬프트 생성 (토큰 최소화)
 * @param {Object} chartData - 점성술 계산 결과
 * @param {string} reportType - 리포트 타입
 * @returns {string} 사용자 프롬프트
 */
function buildUserPrompt(chartData, reportType) {
  const reportTypeDesc = getReportTypeDescription(reportType);
  const compressedData = compressChartData(chartData);

  return `${reportTypeDesc} 분석:

${compressedData}

응답 형식 (JSON만, 마크다운 없음):
{"s":"요약150자이내","a":["행동1","행동2","행동3"],"k":["키워드1","키워드2"]}`;
}

/**
 * Gemini API 응답에서 텍스트 추출 및 JSON 파싱
 * @param {Object} apiResponse - Gemini API 응답 객체
 * @returns {Object} 파싱된 JSON 객체
 * @throws {Error} 응답이 유효하지 않은 경우
 */
function parseGeminiResponse(apiResponse) {
  if (!apiResponse || !apiResponse.candidates || !Array.isArray(apiResponse.candidates)) {
    throw new Error('Invalid API response: missing candidates array.');
  }

  if (apiResponse.candidates.length === 0) {
    throw new Error('Invalid API response: no candidates returned.');
  }

  const candidate = apiResponse.candidates[0];
  
  // 안전성 검사 (MAX_TOKENS인 경우에도 부분 응답 사용 가능)
  if (candidate.finishReason && candidate.finishReason === 'MAX_TOKENS') {
    console.warn('Warning: Response was truncated due to MAX_TOKENS limit. Using partial response.');
    // MAX_TOKENS인 경우에도 생성된 부분 응답을 사용
  } else if (candidate.finishReason && candidate.finishReason !== 'STOP') {
    throw new Error(`API response finished with reason: ${candidate.finishReason}`);
  }

  const content = candidate.content;
  if (!content || !content.parts || !Array.isArray(content.parts) || content.parts.length === 0) {
    throw new Error('Invalid API response: missing content parts.');
  }

  const text = content.parts[0].text;
  if (!text || typeof text !== 'string') {
    throw new Error('Invalid API response: missing or invalid text content.');
  }

  // JSON 추출 (마크다운 코드 블록 제거)
  let jsonText = text.trim();
  
  // 마크다운 코드 블록 제거 (```json ... ``` 또는 ``` ... ```)
  jsonText = jsonText.replace(/^```(?:json)?\s*\n?/i, '');
  jsonText = jsonText.replace(/\n?```\s*$/i, '');
  jsonText = jsonText.trim();

  // JSON 파싱 시도
  try {
    return JSON.parse(jsonText);
  } catch (parseError) {
    // 불완전한 JSON 복구 시도 (MAX_TOKENS로 인한 중단 처리)
    try {
      // 닫히지 않은 문자열 복구
      let fixedJson = jsonText;
      
      // 문자열이 닫히지 않은 경우 복구
      const openQuotes = (fixedJson.match(/"/g) || []).length;
      if (openQuotes % 2 !== 0) {
        // 마지막 따옴표 이후의 내용을 제거하고 닫기
        const lastQuoteIndex = fixedJson.lastIndexOf('"');
        if (lastQuoteIndex !== -1) {
          fixedJson = fixedJson.substring(0, lastQuoteIndex + 1);
        }
      }
      
      // 객체가 닫히지 않은 경우 복구
      const openBraces = (fixedJson.match(/{/g) || []).length;
      const closeBraces = (fixedJson.match(/}/g) || []).length;
      if (openBraces > closeBraces) {
        // 닫히지 않은 배열 먼저 처리
        const openBrackets = (fixedJson.match(/\[/g) || []).length;
        const closeBrackets = (fixedJson.match(/\]/g) || []).length;
        if (openBrackets > closeBrackets) {
          fixedJson += ']';
        }
        // 객체 닫기
        fixedJson += '}';
      }
      
      // 배열이 닫히지 않은 경우 복구
      const openBrackets = (fixedJson.match(/\[/g) || []).length;
      const closeBrackets = (fixedJson.match(/\]/g) || []).length;
      if (openBrackets > closeBrackets) {
        fixedJson += ']';
      }
      
      const repaired = JSON.parse(fixedJson);
      console.warn('Warning: Repaired incomplete JSON response');
      return repaired;
    } catch (repairError) {
      // 복구 실패 시 기본값 반환
      console.error('Failed to repair JSON:', repairError);
      return {
        s: jsonText.substring(0, 150) || '응답 생성 중 오류 발생',
        a: ['다시 시도해주세요'],
        k: ['오류']
      };
    }
  }
}

/**
 * Gemini API 호출 헬퍼 함수
 * @param {string} modelName - 사용할 모델 이름
 * @param {string} apiKey - Gemini API 키
 * @param {Object} requestBody - API 요청 본문
 * @returns {Promise<Object>} API 응답 객체
 */
async function callGeminiAPI(modelName, apiKey, requestBody) {
  const endpoint = `${GEMINI_API_BASE_URL}/models/${modelName}:generateContent?key=${apiKey}`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  // HTTP 응답 검증
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Gemini API request failed: ${response.status} ${response.statusText}. ${errorText}`
    );
  }

  // 응답 파싱
  const apiResponse = await response.json();

  // 에러 응답 확인
  if (apiResponse.error) {
    throw new Error(
      `Gemini API error: ${apiResponse.error.message || JSON.stringify(apiResponse.error)}`
    );
  }

  return apiResponse;
}

/**
 * 점성술 차트 데이터를 기반으로 AI 해석을 받아옴
 * @param {Object} chartData - 점성술 계산 결과 JSON 객체 (astroCalculator.js의 calculateChart 결과)
 * @param {string} reportType - 리포트 타입 ('daily', 'yearly', 'synastry' 등)
 * @param {Object} env - Cloudflare Workers 환경 변수 객체
 * @returns {Promise<Object>} 해석 결과 JSON 객체 또는 에러 객체
 */
export async function getInterpretation(chartData, reportType, env) {
  try {
    // 입력값 검증
    validateInputs(chartData, reportType);

    // API 키 확인
    if (!env || !env.GEMINI_API_KEY) {
      throw new Error('Missing GEMINI_API_KEY environment variable.');
    }

    const apiKey = env.GEMINI_API_KEY;

    // 시스템 프롬프트 설정 (토큰 절약을 위해 간결하게)
    const systemInstruction = {
      parts: [
        {
          text: `점성술 분석가. JSON만 출력. s(요약):공백포함150자이내 핵심만. a(행동):명사형 짧은 문장 3개. k(키워드):2-3개.`,
        },
      ],
    };

    // 사용자 프롬프트 생성
    const userPrompt = buildUserPrompt(chartData, reportType);

    // API 요청 본문 구성
    const requestBody = {
      contents: [
        {
          parts: [
            {
              text: userPrompt,
            },
          ],
        },
      ],
      systemInstruction: systemInstruction,
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 1024, // 완전한 JSON 생성을 위해 토큰 수 증가 (여전히 절약)
      },
    };

    // Gemini API 호출 (gemini-1.5-flash만 사용)
    const apiResponse = await callGeminiAPI(GEMINI_MODEL, apiKey, requestBody);

    // JSON 파싱 및 반환
    const interpretation = parseGeminiResponse(apiResponse);

    return {
      success: true,
      reportType: reportType,
      interpretation: interpretation,
    };
  } catch (error) {
    // 에러 처리: 명확한 에러 메시지 반환
    return {
      success: false,
      error: true,
      message: error.message || 'Unknown error occurred during AI interpretation.',
      details: error.toString(),
    };
  }
}
