/**
 * GeoNames API를 사용한 도시 검색 및 자동완성 기능
 * 순수 JavaScript (Vanilla JS) 모듈
 */

const GEO_NAMES_USERNAME = 'adriejeon';
const DEBOUNCE_DELAY = 400; // 400ms 디바운스

/**
 * 도시 검색 자동완성 클래스
 */
class CityAutocomplete {
  constructor(options) {
    this.inputElement = options.inputElement;
    this.dropdownElement = options.dropdownElement;
    this.latInput = options.latInput;
    this.lngInput = options.lngInput;
    this.timezoneInput = options.timezoneInput;
    this.onSelectCallback = options.onSelect || null;
    
    this.debounceTimer = null;
    this.searchResults = [];
    this.selectedIndex = -1;
    
    this.init();
  }

  /**
   * 초기화
   */
  init() {
    // 입력 이벤트 리스너
    this.inputElement.addEventListener('input', (e) => {
      this.handleInput(e.target.value);
    });

    // 키보드 이벤트 리스너 (화살표 키, 엔터 키 지원)
    this.inputElement.addEventListener('keydown', (e) => {
      this.handleKeyDown(e);
    });

    // 외부 클릭 시 드롭다운 닫기
    document.addEventListener('click', (e) => {
      if (!this.inputElement.contains(e.target) && 
          !this.dropdownElement.contains(e.target)) {
        this.hideDropdown();
      }
    });

  }

  /**
   * 입력 처리 (디바운싱 적용)
   */
  handleInput(value) {
    // 디바운스 타이머 초기화
    clearTimeout(this.debounceTimer);

    // 빈 값이면 드롭다운 숨기기
    if (!value || value.trim().length === 0) {
      this.hideDropdown();
      return;
    }

    // 디바운스 적용
    this.debounceTimer = setTimeout(() => {
      this.searchCities(value.trim());
    }, DEBOUNCE_DELAY);
  }

  /**
   * 키보드 이벤트 처리
   */
  handleKeyDown(e) {
    if (!this.isDropdownVisible()) {
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this.selectedIndex = Math.min(
          this.selectedIndex + 1,
          this.searchResults.length - 1
        );
        this.highlightItem(this.selectedIndex);
        break;
      
      case 'ArrowUp':
        e.preventDefault();
        this.selectedIndex = Math.max(this.selectedIndex - 1, -1);
        this.highlightItem(this.selectedIndex);
        break;
      
      case 'Enter':
        e.preventDefault();
        if (this.selectedIndex >= 0 && this.selectedIndex < this.searchResults.length) {
          this.selectCity(this.searchResults[this.selectedIndex]);
        }
        break;
      
      case 'Escape':
        this.hideDropdown();
        break;
    }
  }

  /**
   * GeoNames API로 도시 검색
   */
  async searchCities(query) {
    try {
      // HTTPS를 사용하거나 CORS 프록시를 통해 호출
      // GeoNames는 CORS를 지원하지 않으므로, 필요시 백엔드 프록시를 사용해야 할 수 있습니다
      const url = `https://secure.geonames.org/searchJSON?q=${encodeURIComponent(query)}&maxRows=10&username=${GEO_NAMES_USERNAME}&style=FULL`;
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.geonames && data.geonames.length > 0) {
        this.searchResults = data.geonames;
        this.displayResults(data.geonames);
      } else {
        this.searchResults = [];
        this.hideDropdown();
      }
    } catch (error) {
      console.error('도시 검색 오류:', error);
      this.searchResults = [];
      this.hideDropdown();
    }
  }

  /**
   * 검색 결과 표시
   */
  displayResults(results) {
    // 드롭다운 초기화
    this.dropdownElement.innerHTML = '';
    this.selectedIndex = -1;

    // 결과가 없으면 숨기기
    if (!results || results.length === 0) {
      this.hideDropdown();
      return;
    }

    // 각 결과를 리스트 아이템으로 추가
    results.forEach((city, index) => {
      const item = document.createElement('li');
      item.className = 'city-autocomplete-item';
      item.dataset.index = index;
      
      const cityName = city.name || '';
      const countryName = city.countryName || '';
      const displayText = countryName ? `${cityName}, ${countryName}` : cityName;
      
      item.textContent = displayText;
      
      // 클릭 이벤트
      item.addEventListener('click', () => {
        this.selectCity(city);
      });

      // 마우스 호버 시 하이라이트
      item.addEventListener('mouseenter', () => {
        this.selectedIndex = index;
        this.highlightItem(index);
      });

      this.dropdownElement.appendChild(item);
    });

    // 드롭다운 표시
    this.showDropdown();
  }

  /**
   * 아이템 하이라이트
   */
  highlightItem(index) {
    const items = this.dropdownElement.querySelectorAll('.city-autocomplete-item');
    items.forEach((item, i) => {
      if (i === index) {
        item.classList.add('highlighted');
      } else {
        item.classList.remove('highlighted');
      }
    });
  }

  /**
   * 도시 선택 처리
   */
  selectCity(city) {
    const cityName = city.name || '';
    const countryName = city.countryName || '';
    const lat = city.lat || '';
    const lng = city.lng || '';
    const timezone = city.timezone?.timeZoneId || city.timezone || '';

    // 입력창에 "도시명, 국가명" 채우기
    this.inputElement.value = countryName ? `${cityName}, ${countryName}` : cityName;

    // 숨겨진 필드에 값 저장
    if (this.latInput) {
      this.latInput.value = lat;
    }
    if (this.lngInput) {
      this.lngInput.value = lng;
    }
    if (this.timezoneInput) {
      this.timezoneInput.value = timezone;
    }

    // 드롭다운 숨기기
    this.hideDropdown();

    // 콜백 실행
    if (this.onSelectCallback) {
      this.onSelectCallback({
        name: cityName,
        countryName: countryName,
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        timezone: timezone
      });
    }
  }

  /**
   * 드롭다운 표시
   */
  showDropdown() {
    this.dropdownElement.style.display = 'block';
  }

  /**
   * 드롭다운 숨기기
   */
  hideDropdown() {
    this.dropdownElement.style.display = 'none';
    this.selectedIndex = -1;
  }

  /**
   * 드롭다운 표시 여부 확인
   */
  isDropdownVisible() {
    return this.dropdownElement.style.display === 'block';
  }
}

export default CityAutocomplete;
