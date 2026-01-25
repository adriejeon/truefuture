import { useState, useEffect, useCallback } from 'react'

/**
 * 생년월일 데이터를 관리하는 Custom Hook
 * @param {string} storageKey - localStorage에 저장할 고유 키 (예: 'birth_info_me', 'birth_info_partner')
 * @returns {Object} { birthData, updateBirthData, clearData }
 */
export function useBirthData(storageKey) {
  // Lazy Initialization: 컴포넌트 생성 시 동기적으로 localStorage에서 데이터 로드
  const [birthData, setBirthData] = useState(() => {
    try {
      const savedData = localStorage.getItem(storageKey)
      if (savedData) {
        const parsed = JSON.parse(savedData)
        return parsed
      }
    } catch (error) {
      console.error(`Failed to load data from localStorage (${storageKey}):`, error)
    }
    
    // localStorage에 데이터가 없거나 파싱 실패 시 기본값 반환
    return {
      birthDate: '',      // 포맷: YYYY.MM.DD
      birthTime: '',      // 포맷: HH:mm
      gender: '',         // 성별: '남자' 또는 '여자'
      cityData: {
        name: '',
        lat: null,
        lng: null,
        timezone: ''
      }
    }
  })

  // 데이터가 변경될 때마다 localStorage에 저장
  useEffect(() => {
    try {
      // 데이터가 존재하면 저장 (빈 값이어도 저장하여 상태 유지)
      localStorage.setItem(storageKey, JSON.stringify(birthData))
    } catch (error) {
      console.error(`Failed to save data to localStorage (${storageKey}):`, error)
    }
  }, [birthData, storageKey])

  // 데이터 업데이트 함수
  const updateBirthData = useCallback((updates) => {
    setBirthData(prev => ({
      ...prev,
      ...updates
    }))
  }, [])

  // 명시적 데이터 삭제 함수 (로그아웃 시 사용)
  const clearData = useCallback(() => {
    setBirthData({
      birthDate: '',
      birthTime: '',
      gender: '',
      cityData: {
        name: '',
        lat: null,
        lng: null,
        timezone: ''
      }
    })
    localStorage.removeItem(storageKey)
  }, [storageKey])

  return {
    birthData,
    updateBirthData,
    clearData
  }
}
