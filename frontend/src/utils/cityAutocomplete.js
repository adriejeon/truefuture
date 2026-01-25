/**
 * GeoNames API를 사용한 도시 검색 및 자동완성 기능
 * 순수 JavaScript (Vanilla JS) 모듈
 */

const GEO_NAMES_USERNAME = "adriejeon";
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
    this.isSelecting = false; // 도시 선택 중 플래그 (재검색 방지)
    this.isSearching = false; // 검색 중 플래그 (중복 호출 방지)
    this.lastSearchQuery = null; // 마지막 검색 쿼리 (중복 호출 방지)

    this.init();
  }

  /**
   * 초기화
   */
  init() {
    // 이벤트 핸들러를 바인딩하여 나중에 제거할 수 있도록 저장
    this.handleInputEvent = (e) => {
      this.handleInput(e.target.value);
    };

    this.handleKeyDownEvent = (e) => {
      this.handleKeyDown(e);
    };

    this.handleDocumentClick = (e) => {
      // input 요소나 드롭다운 요소 내부를 클릭한 경우가 아니면 드롭다운 닫기
      if (this.inputElement && this.dropdownElement) {
        const clickedInsideInput =
          this.inputElement === e.target ||
          this.inputElement.contains(e.target);
        const clickedInsideDropdown =
          this.dropdownElement === e.target ||
          this.dropdownElement.contains(e.target);

        if (!clickedInsideInput && !clickedInsideDropdown) {
          this.hideDropdown();
        }
      }
    };

    // 입력 이벤트 리스너
    this.inputElement.addEventListener("input", this.handleInputEvent);

    // 키보드 이벤트 리스너 (화살표 키, 엔터 키 지원)
    this.inputElement.addEventListener("keydown", this.handleKeyDownEvent);

    // 외부 클릭 시 드롭다운 닫기
    document.addEventListener("click", this.handleDocumentClick);

    // 화면 크기 변경 및 스크롤 시 maxHeight 업데이트
    this.handleResize = () => {
      if (this.isDropdownVisible()) {
        this.updateDropdownMaxHeight();
      }
    };

    window.addEventListener("resize", this.handleResize);
    window.addEventListener("scroll", this.handleResize, true);
  }

  /**
   * 입력 처리 (디바운싱 적용)
   */
  handleInput(value) {
    // 도시 선택 중이면 재검색하지 않음
    if (this.isSelecting) {
      return;
    }

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
      case "ArrowDown":
        e.preventDefault();
        this.selectedIndex = Math.min(
          this.selectedIndex + 1,
          this.searchResults.length - 1,
        );
        this.highlightItem(this.selectedIndex);
        break;

      case "ArrowUp":
        e.preventDefault();
        this.selectedIndex = Math.max(this.selectedIndex - 1, -1);
        this.highlightItem(this.selectedIndex);
        break;

      case "Enter":
        e.preventDefault();
        if (
          this.selectedIndex >= 0 &&
          this.selectedIndex < this.searchResults.length
        ) {
          this.selectCity(this.searchResults[this.selectedIndex]);
        }
        break;

      case "Escape":
        this.hideDropdown();
        break;
    }
  }

  /**
   * GeoNames API로 도시 검색
   */
  async searchCities(query) {
    // 중복 호출 방지: 이미 같은 쿼리로 검색 중이면 무시
    if (this.isSearching && this.lastSearchQuery === query) {
      console.log(
        "CityAutocomplete: 이미 같은 쿼리로 검색 중입니다. 중복 호출 방지:",
        query,
      );
      return;
    }

    // 검색 시작 플래그 설정
    this.isSearching = true;
    this.lastSearchQuery = query;

    try {
      // HTTPS를 사용하거나 CORS 프록시를 통해 호출
      // GeoNames는 CORS를 지원하지 않으므로, 필요시 백엔드 프록시를 사용해야 할 수 있습니다
      const url = `https://secure.geonames.org/searchJSON?q=${encodeURIComponent(query)}&maxRows=10&username=${GEO_NAMES_USERNAME}&style=FULL`;

      console.log("CityAutocomplete: API 호출 시작:", query);
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      // 검색이 완료되었지만, 쿼리가 변경되었거나 인스턴스가 destroy된 경우 무시
      if (this.lastSearchQuery !== query) {
        console.log(
          "CityAutocomplete: 쿼리가 변경되었습니다. 결과 무시:",
          query,
          "->",
          this.lastSearchQuery,
        );
        this.isSearching = false;
        return;
      }

      if (data.geonames && data.geonames.length > 0) {
        console.log(
          "CityAutocomplete: 검색 결과 받음:",
          data.geonames.length,
          "개",
        );
        this.searchResults = data.geonames;
        this.displayResults(data.geonames);
      } else {
        console.log("CityAutocomplete: 검색 결과 없음");
        this.searchResults = [];
        this.hideDropdown();
      }
    } catch (error) {
      console.error("도시 검색 오류:", error);
      this.searchResults = [];
      this.hideDropdown();
    } finally {
      this.isSearching = false;
    }
  }

  /**
   * 검색 결과 표시
   */
  displayResults(results) {
    console.log("CityAutocomplete: displayResults 호출됨", {
      resultsCount: results?.length || 0,
      hasDropdownElement: !!this.dropdownElement,
      dropdownDisplay: this.dropdownElement?.style?.display,
    });

    // 드롭다운 요소가 없으면 중단
    if (!this.dropdownElement) {
      console.error("CityAutocomplete: dropdownElement가 null입니다.");
      return;
    }

    // 드롭다운 초기화
    this.dropdownElement.innerHTML = "";
    this.selectedIndex = -1;

    // 결과가 없으면 숨기기
    if (!results || results.length === 0) {
      console.log("CityAutocomplete: 결과가 없어 드롭다운 숨김");
      this.hideDropdown();
      return;
    }

    // 각 결과를 리스트 아이템으로 추가
    results.forEach((city, index) => {
      const item = document.createElement("li");
      item.className = "city-autocomplete-item";
      item.dataset.index = index;

      const cityName = city.name || "";
      const countryName = city.countryName || "";
      const displayText = countryName
        ? `${cityName}, ${countryName}`
        : cityName;

      item.textContent = displayText;

      // 클릭 이벤트
      item.addEventListener("click", () => {
        this.selectCity(city);
      });

      // 마우스 호버 시 하이라이트
      item.addEventListener("mouseenter", () => {
        this.selectedIndex = index;
        this.highlightItem(index);
      });

      this.dropdownElement.appendChild(item);
    });

    console.log("CityAutocomplete: 드롭다운 아이템 추가 완료, 표시 시도");
    // 드롭다운 표시
    this.showDropdown();
  }

  /**
   * 아이템 하이라이트
   */
  highlightItem(index) {
    const items = this.dropdownElement.querySelectorAll(
      ".city-autocomplete-item",
    );
    items.forEach((item, i) => {
      if (i === index) {
        item.classList.add("highlighted");
      } else {
        item.classList.remove("highlighted");
      }
    });
  }

  /**
   * 도시 선택 처리
   */
  selectCity(city) {
    // 선택 중 플래그 설정 (재검색 방지)
    this.isSelecting = true;

    const cityName = city.name || "";
    const countryName = city.countryName || "";
    const lat = city.lat || "";
    const lng = city.lng || "";
    const timezone = city.timezone?.timeZoneId || city.timezone || "";

    // 입력창에 "도시명, 국가명" 채우기
    this.inputElement.value = countryName
      ? `${cityName}, ${countryName}`
      : cityName;

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
        timezone: timezone,
      });
    }

    // 짧은 딜레이 후 플래그 해제 (이벤트 처리 완료 대기)
    setTimeout(() => {
      this.isSelecting = false;
    }, 100);
  }

  /**
   * 드롭다운 표시
   */
  showDropdown() {
    if (!this.dropdownElement) {
      console.error(
        "CityAutocomplete: showDropdown - dropdownElement가 null입니다.",
      );
      return;
    }

    console.log("CityAutocomplete: showDropdown 호출됨", {
      hasChildren: this.dropdownElement.children.length > 0,
      hasHiddenClass: this.dropdownElement.classList.contains(
        "city-autocomplete-dropdown-hidden",
      ),
    });

    // 숨김 클래스 제거
    this.dropdownElement.classList.remove("city-autocomplete-dropdown-hidden");

    console.log("CityAutocomplete: 드롭다운 표시됨", {
      hasHiddenClass: this.dropdownElement.classList.contains(
        "city-autocomplete-dropdown-hidden",
      ),
      computedDisplay: window.getComputedStyle(this.dropdownElement).display,
    });

    // 화면 하단까지의 거리를 계산하여 maxHeight 동적 설정
    this.updateDropdownMaxHeight();
  }

  /**
   * 드롭다운의 maxHeight를 화면 하단까지의 거리로 동적 설정
   */
  updateDropdownMaxHeight() {
    const dropdownRect = this.dropdownElement.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const spaceBelow = viewportHeight - dropdownRect.top;

    // 여유 공간을 위해 약간의 패딩 추가 (20px)
    const maxHeight = Math.max(100, spaceBelow - 20);

    // CSS의 기본 max-height보다 작으면 동적으로 설정
    if (maxHeight < 300) {
      this.dropdownElement.style.maxHeight = `${maxHeight}px`;
    } else {
      // 기본값 사용 (CSS에서 설정한 300px)
      this.dropdownElement.style.maxHeight = "";
    }
  }

  /**
   * 드롭다운 숨기기
   */
  hideDropdown() {
    if (this.dropdownElement) {
      this.dropdownElement.classList.add("city-autocomplete-dropdown-hidden");
    }
    this.selectedIndex = -1;
  }

  /**
   * 드롭다운 표시 여부 확인
   */
  isDropdownVisible() {
    return (
      this.dropdownElement &&
      !this.dropdownElement.classList.contains(
        "city-autocomplete-dropdown-hidden",
      )
    );
  }

  /**
   * 리소스 정리 (이벤트 리스너 제거)
   */
  destroy() {
    // 디바운스 타이머 정리
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    // input 요소 이벤트 리스너 제거
    if (this.inputElement && this.handleInputEvent) {
      this.inputElement.removeEventListener("input", this.handleInputEvent);
    }
    if (this.inputElement && this.handleKeyDownEvent) {
      this.inputElement.removeEventListener("keydown", this.handleKeyDownEvent);
    }

    // document 클릭 이벤트 리스너 제거
    if (this.handleDocumentClick) {
      document.removeEventListener("click", this.handleDocumentClick);
    }

    // window 이벤트 리스너 제거
    if (this.handleResize) {
      window.removeEventListener("resize", this.handleResize);
      window.removeEventListener("scroll", this.handleResize, true);
    }

    // 드롭다운 숨기기
    if (this.dropdownElement) {
      this.hideDropdown();
    }
  }
}

export default CityAutocomplete;
