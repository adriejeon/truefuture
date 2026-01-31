"""
진짜미래(True Future) - 필수 위계(Dignities) 관계 적재
Exaltation(항진), Detriment(손상), Fall(추락)
"""

from database import Neo4jConnector


# Exaltation(항진): 행성 -> 해당 별자리 리스트
EXALTATION = {
    "Sun": ["Aries"],
    "Moon": ["Taurus"],
    "Mercury": ["Virgo"],
    "Venus": ["Pisces"],
    "Mars": ["Capricorn"],
    "Jupiter": ["Cancer"],
    "Saturn": ["Libra"],
}

# Detriment(손상): 룰러십의 반대편 별자리
DETRIMENT = {
    "Sun": ["Aquarius"],
    "Moon": ["Capricorn"],
    "Mercury": ["Sagittarius", "Pisces"],
    "Venus": ["Aries", "Scorpio"],
    "Mars": ["Taurus", "Libra"],
    "Jupiter": ["Gemini", "Virgo"],
    "Saturn": ["Cancer", "Leo"],
}

# Fall(추락): Exaltation의 반대편 별자리
FALL = {
    "Sun": ["Libra"],
    "Moon": ["Scorpio"],
    "Mercury": ["Pisces"],
    "Venus": ["Virgo"],
    "Mars": ["Cancer"],
    "Jupiter": ["Capricorn"],
    "Saturn": ["Aries"],
}


def create_dignity_relationships(
    connector: Neo4jConnector,
    mapping: dict[str, list[str]],
    rel_type: str,
) -> None:
    """행성-별자리 매핑과 관계 타입을 받아 MATCH 후 MERGE로 관계를 생성합니다."""
    for planet_name, sign_names in mapping.items():
        for sign_name in sign_names:
            connector.run_query(
                f"""
                MATCH (p:Planet {{name: $planet_name}})
                MATCH (s:Sign {{name: $sign_name}})
                MERGE (p)-[:{rel_type}]->(s)
                """,
                {"planet_name": planet_name, "sign_name": sign_name},
            )


if __name__ == "__main__":
    connector = None
    try:
        connector = Neo4jConnector()
        create_dignity_relationships(connector, EXALTATION, "EXALTED_IN")
        create_dignity_relationships(connector, DETRIMENT, "DETRIMENT_IN")
        create_dignity_relationships(connector, FALL, "FALL_IN")
        print("필수 위계(Dignities) 3종 세트 연결 완료!")
    finally:
        if connector:
            connector.close()
