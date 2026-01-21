import { useEffect, useRef } from 'react';
import CityAutocomplete from '../utils/cityAutocomplete';
import './CityAutocomplete.css';

/**
 * 도시 검색 자동완성 컴포넌트
 */
function CityAutocompleteComponent({ onCitySelect, className = '' }) {
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);
  const latInputRef = useRef(null);
  const lngInputRef = useRef(null);
  const timezoneInputRef = useRef(null);
  const autocompleteInstanceRef = useRef(null);

  useEffect(() => {
    // 컴포넌트 마운트 시 자동완성 인스턴스 생성
    if (inputRef.current && dropdownRef.current) {
      autocompleteInstanceRef.current = new CityAutocomplete({
        inputElement: inputRef.current,
        dropdownElement: dropdownRef.current,
        latInput: latInputRef.current,
        lngInput: lngInputRef.current,
        timezoneInput: timezoneInputRef.current,
        onSelect: onCitySelect || null
      });
    }

    // 언마운트 시 정리
    return () => {
      if (autocompleteInstanceRef.current) {
        autocompleteInstanceRef.current.destroy();
        autocompleteInstanceRef.current = null;
      }
    };
  }, [onCitySelect]);

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
}

export default CityAutocompleteComponent;
