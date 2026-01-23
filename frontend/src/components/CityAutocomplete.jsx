import { useEffect, useRef, memo } from 'react';
import CityAutocomplete from '../utils/cityAutocomplete';
import './CityAutocomplete.css';

/**
 * 도시 검색 자동완성 컴포넌트
 * React.memo로 감싸서 부모 리렌더링 시 불필요한 재렌더링 방지
 */
const CityAutocompleteComponent = memo(function CityAutocompleteComponent({ onCitySelect, className = '' }) {
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);
  const latInputRef = useRef(null);
  const lngInputRef = useRef(null);
  const timezoneInputRef = useRef(null);
  const autocompleteInstanceRef = useRef(null);
  
  // onCitySelect 콜백을 ref로 저장하여 최신 콜백 참조 유지
  const onCitySelectRef = useRef(onCitySelect);
  
  // 콜백이 변경될 때마다 ref 업데이트 (인스턴스 재생성 없이)
  useEffect(() => {
    onCitySelectRef.current = onCitySelect;
  }, [onCitySelect]);

  useEffect(() => {
    // 컴포넌트 마운트 시 자동완성 인스턴스 생성 (한 번만 실행)
    if (inputRef.current && dropdownRef.current) {
      // ref를 통해 최신 콜백 참조 (의존성 배열에서 onCitySelect 제거)
      const wrappedCallback = (selectedCity) => {
        if (onCitySelectRef.current) {
          onCitySelectRef.current(selectedCity);
        }
      };
      
      autocompleteInstanceRef.current = new CityAutocomplete({
        inputElement: inputRef.current,
        dropdownElement: dropdownRef.current,
        latInput: latInputRef.current,
        lngInput: lngInputRef.current,
        timezoneInput: timezoneInputRef.current,
        onSelect: wrappedCallback
      });
    }

    // 언마운트 시 정리
    return () => {
      if (autocompleteInstanceRef.current) {
        autocompleteInstanceRef.current.destroy();
        autocompleteInstanceRef.current = null;
      }
    };
  }, []); // 의존성 배열 비움 - 마운트 시 한 번만 실행

  return (
    <div className={`city-autocomplete-wrapper ${className}`}>
      <input
        ref={inputRef}
        type="text"
        id="cityInput"
        placeholder="도시 이름을 입력하세요 (예: Seoul, Tokyo)"
        className="city-autocomplete-input"
      />
      
      <ul
        ref={dropdownRef}
        id="cityDropdown"
        className="city-autocomplete-dropdown"
        style={{ display: 'none' }}
      />

      {/* 숨겨진 필드들 */}
      <input
        ref={latInputRef}
        type="hidden"
        id="cityLat"
        name="cityLat"
      />
      <input
        ref={lngInputRef}
        type="hidden"
        id="cityLng"
        name="cityLng"
      />
      <input
        ref={timezoneInputRef}
        type="hidden"
        id="cityTimezone"
        name="cityTimezone"
      />
    </div>
  );
});

export default CityAutocompleteComponent;
