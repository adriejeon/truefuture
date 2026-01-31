"""
진짜미래(True Future) - 해석용 한글 키워드(Keywords) 속성 적재
Planets: keywords_pos / keywords_neg
Signs: keywords
Houses: meaning
"""

from database import Neo4jConnector


# [A] Planets: name -> (keywords_pos, keywords_neg)
PLANET_KEYWORDS = {
    "Sun": {
        "keywords_pos": "명예, 권위, 리더십, 자아실현",
        "keywords_neg": "오만, 독선, 허세, 낭비",
    },
    "Moon": {
        "keywords_pos": "감정, 본능, 양육, 대중적 인기",
        "keywords_neg": "변덕, 불안, 우유부단, 감정과잉, 유행성 질병, 주기적으로 찾아오는 질병",
    },
    "Mercury": {
        "keywords_pos": "지성, 소통, 언어, 상업, 논리",
        "keywords_neg": "잔머리, 속임수, 신경과민, 불안정",
    },
    "Venus": {
        "keywords_pos": "사랑, 예술, 조화, 쾌락, 매력",
        "keywords_neg": "방탕, 게으름, 허영심, 집착",
    },
    "Mars": {
        "keywords_pos": "행동력, 용기, 열정, 추진력",
        "keywords_neg": "분노, 폭력, 성급함, 사고, 다툼",
    },
    "Jupiter": {
        "keywords_pos": "성장, 행운, 철학, 너그러움, 성공",
        "keywords_neg": "과장, 허풍, 낭비, 무책임",
    },
    "Saturn": {
        "keywords_pos": "인내, 책임, 규율, 현실감각, 노력",
        "keywords_neg": "우울, 제한, 인색, 고독, 지연",
    },
}

# [B] Signs: name -> keywords
SIGN_KEYWORDS = {
    "Aries": "도전적, 직설적, 급함, 개척정신",
    "Taurus": "안정적, 감각적, 고집, 소유욕",
    "Gemini": "호기심, 다재다능, 산만함, 임기응변",
    "Cancer": "보호본능, 감수성, 배타적, 가정적",
    "Leo": "창조적, 드라마틱, 자기중심, 돋보임",
    "Virgo": "분석적, 봉사, 비판적, 꼼꼼함",
    "Libra": "사교적, 균형, 우유부단, 타인의식",
    "Scorpio": "통찰력, 집요함, 비밀, 강한 의지",
    "Sagittarius": "낙천적, 자유, 무모함, 이상주의",
    "Capricorn": "야망, 신중, 보수적, 성취지향",
    "Aquarius": "독창적, 이성적, 반항적, 독립심",
    "Pisces": "공감, 예술적, 혼란, 희생정신",
}

# [C] Houses: number -> meaning
HOUSE_MEANINGS = {
    1: "본인, 외모, 생명력, 성격, 타고난 능력",
    2: "재물, 소유, 경제활동, 가치관, 현금흐름",
    3: "형제, 단기여행, 기초학습, 소통, 컨설팅",
    4: "가정, 부모, 부동산, 뿌리, 노후",
    5: "자녀, 유흥, 연애, 창작, 취미",
    6: "질병, 노동, 의무, 반려동물, 봉사",
    7: "결혼, 배우자, 파트너, 계약, 공개적 적",
    8: "죽음, 유산, 타인의 돈, 보험, 대출, 위기",
    9: "종교, 철학, 장기여행, 고등교육, 출판, 유통, 해외, 무역",
    10: "직업, 명예, 사회적 성취, 상사, 회사",
    11: "친구, 희망, 후원자, 단체활동, 행운, 미래계획",
    12: "고립, 숨겨진 적, 무의식, 감금, 병원, 이민, 혼자 하는 일, 해외",
}


def update_planet_keywords(connector: Neo4jConnector) -> None:
    """각 Planet 노드에 keywords_pos, keywords_neg를 SET 합니다."""
    for name, kw in PLANET_KEYWORDS.items():
        connector.run_query(
            """
            MATCH (p:Planet {name: $name})
            SET p.keywords_pos = $keywords_pos, p.keywords_neg = $keywords_neg
            """,
            {"name": name, "keywords_pos": kw["keywords_pos"], "keywords_neg": kw["keywords_neg"]},
        )


def update_sign_keywords(connector: Neo4jConnector) -> None:
    """각 Sign 노드에 keywords를 SET 합니다."""
    for name, keywords in SIGN_KEYWORDS.items():
        connector.run_query(
            """
            MATCH (s:Sign {name: $name})
            SET s.keywords = $keywords
            """,
            {"name": name, "keywords": keywords},
        )


def update_house_meanings(connector: Neo4jConnector) -> None:
    """각 House 노드에 meaning을 SET 합니다."""
    for number, meaning in HOUSE_MEANINGS.items():
        connector.run_query(
            """
            MATCH (h:House {number: $number})
            SET h.meaning = $meaning
            """,
            {"number": number, "meaning": meaning},
        )


if __name__ == "__main__":
    connector = None
    try:
        connector = Neo4jConnector()
        update_planet_keywords(connector)
        update_sign_keywords(connector)
        update_house_meanings(connector)
        print("모든 해석 키워드 입력 완료!")
    finally:
        if connector:
            connector.close()
