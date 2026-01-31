"""
진짜미래(True Future) - 내담자 차트 기반 해석 근거(Context) 조회
Neo4j에서 위계(Dignity), 섹트(Sect), 헤이즈(Hayz)를 반영한 텍스트 생성
"""

from database import Neo4jConnector


# 위계(Dignity) 관계 타입 -> 한글 설명
DIGNITY_LABELS = {
    "RULES": "룰러쉽 (매우 강력함)",
    "EXALTED_IN": "항진 (강력함)",
    "DETRIMENT_IN": "손상 (불편함)",
    "FALL_IN": "추락 (약함)",
}


def get_planet_context(
    planet_name: str,
    sign_name: str,
    house_num: int,
    is_day_chart: bool,
    connector: Neo4jConnector | None = None,
) -> str:
    """
    행성·별자리·하우스와 위계/섹트 정보를 조회해 LLM용 해석 근거 텍스트를 반환합니다.

    Args:
        planet_name: 행성 이름 (예: "Sun", "Mars")
        sign_name: 별자리 이름 (예: "Leo", "Libra")
        house_num: 하우스 번호 (1~12)
        is_day_chart: 낮 차트 여부 (True=낮, False=밤)
        connector: Neo4jConnector 인스턴스. None이면 내부에서 생성 후 종료.

    Returns:
        해석 근거(Context) 텍스트 문자열.
    """
    own_connector = connector is None
    if own_connector:
        connector = Neo4jConnector()

    try:
        rows = connector.run_query(
            """
            MATCH (p:Planet {name: $planet_name})
            MATCH (s:Sign {name: $sign_name})
            MATCH (h:House {number: $house_num})
            OPTIONAL MATCH (p)-[r:RULES|EXALTED_IN|DETRIMENT_IN|FALL_IN]->(s)
            RETURN p.keywords_pos AS keywords_pos,
                   p.keywords_neg AS keywords_neg,
                   p.sect AS sect,
                   s.keywords AS sign_keywords,
                   s.gender AS sign_gender,
                   h.meaning AS house_meaning,
                   type(r) AS dignity_type
            """,
            {
                "planet_name": planet_name,
                "sign_name": sign_name,
                "house_num": house_num,
            },
        )
    finally:
        if own_connector and connector:
            connector.close()

    if not rows:
        return (
            f"[점성술 분석 데이터]\n"
            f"입력한 조합을 찾을 수 없습니다: 행성={planet_name}, 별자리={sign_name}, 하우스={house_num}"
        )

    row = rows[0]
    pos_keywords = row.get("keywords_pos") or "(없음)"
    neg_keywords = row.get("keywords_neg") or "(없음)"
    sign_keywords = row.get("sign_keywords") or "(없음)"
    house_meaning = row.get("house_meaning") or "(없음)"
    sect = row.get("sect") or ""
    sign_gender = row.get("sign_gender") or ""
    dignity_type = row.get("dignity_type")

    if dignity_type:
        dignity_status = DIGNITY_LABELS.get(dignity_type, dignity_type)
    else:
        dignity_status = "방랑자 (중립)"

    # Hayz: 낮 차트 + Diurnal + Masculine / 밤 차트 + Nocturnal + Feminine
    is_hayz = False
    if is_day_chart and sect == "Diurnal" and sign_gender == "Masculine":
        is_hayz = True
    if not is_day_chart and sect == "Nocturnal" and sign_gender == "Feminine":
        is_hayz = True

    if is_hayz:
        hayz_message = "이 행성은 Hayz(헤이즈) 상태입니다. 섹트에 잘 맞는 위치로, 해당 영역에서 긍정적으로 발현되기 유리합니다."
    else:
        hayz_message = "Hayz는 아니나, 위계와 하우스 맥락에 따라 해석을 조정하세요."

    chart_type = "낮 차트(Day)" if is_day_chart else "밤 차트(Night)"

    return (
        "[점성술 분석 데이터]\n"
        f"1. 배치: {planet_name}이(가) {sign_name}의 {house_num}하우스에 위치함. ({chart_type})\n"
        "2. 기본 성향:\n"
        f"   - 행성 키워드: {pos_keywords} (주의: {neg_keywords})\n"
        f"   - 별자리 분위기: {sign_keywords}\n"
        f"   - 하우스 영역: {house_meaning}\n"
        f"3. 행성의 힘(Dignity): {dignity_status}\n"
        f"4. 특별 조언(Sect): {hayz_message}"
    )


if __name__ == "__main__":
    connector = Neo4jConnector()
    try:
        print("=== 테스트 케이스 1: 태양(Sun) in 사자자리(Leo) 10하우스, 낮 차트 (룰러쉽 + Hayz 예상) ===\n")
        print(get_planet_context("Sun", "Leo", 10, is_day_chart=True, connector=connector))
        print("\n")
        print("=== 테스트 케이스 2: 화성(Mars) in 천칭자리(Libra) 7하우스, 밤 차트 (디트리먼트 예상) ===\n")
        print(get_planet_context("Mars", "Libra", 7, is_day_chart=False, connector=connector))
    finally:
        connector.close()
