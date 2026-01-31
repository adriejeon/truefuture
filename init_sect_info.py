"""
진짜미래(True Future) - 섹트(Sect) 및 성별(Gender) 기초 속성 적재
고전 점성술 핵심 개념: Sect(낮/밤/중립), Sign Gender(남성/여성)
"""

from database import Neo4jConnector


# 행성 섹트: sect 값 -> 해당 행성 이름 리스트
SECT = {
    "Diurnal": ["Sun", "Jupiter", "Saturn"],   # 낮
    "Nocturnal": ["Moon", "Venus", "Mars"],    # 밤
    "Neutral": ["Mercury"],                     # 중립
}

# 별자리 성별: gender 값 -> 해당 별자리 이름 리스트
GENDER = {
    "Masculine": ["Aries", "Gemini", "Leo", "Libra", "Sagittarius", "Aquarius"],  # Fire & Air
    "Feminine": ["Taurus", "Cancer", "Virgo", "Scorpio", "Capricorn", "Pisces"],  # Earth & Water
}


def update_planet_sects(connector: Neo4jConnector) -> None:
    """각 Planet 노드에 sect 속성을 SET 합니다."""
    for sect, names in SECT.items():
        connector.run_query(
            """
            UNWIND $names AS name
            MATCH (p:Planet {name: name})
            SET p.sect = $sect
            """,
            {"names": names, "sect": sect},
        )


def update_sign_genders(connector: Neo4jConnector) -> None:
    """각 Sign 노드에 gender 속성을 SET 합니다."""
    for gender, names in GENDER.items():
        connector.run_query(
            """
            UNWIND $names AS name
            MATCH (s:Sign {name: name})
            SET s.gender = $gender
            """,
            {"names": names, "gender": gender},
        )


if __name__ == "__main__":
    connector = None
    try:
        connector = Neo4jConnector()
        update_planet_sects(connector)
        update_sign_genders(connector)
        print("섹트 및 성별 데이터 입력 완료!")
    finally:
        if connector:
            connector.close()
