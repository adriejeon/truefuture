"""
진짜미래(True Future) - 고전 점성술(Classical Astrology) 룰러십(Rulership) 관계 적재
Planet -[:RULES]-> Sign
"""

from database import Neo4jConnector


# 고전 점성술 룰러십: 행성 이름 -> 그 행성이 지배하는 별자리 이름 리스트
RULERSHIP = {
    "Sun": ["Leo"],
    "Moon": ["Cancer"],
    "Mercury": ["Gemini", "Virgo"],
    "Venus": ["Taurus", "Libra"],
    "Mars": ["Aries", "Scorpio"],
    "Jupiter": ["Sagittarius", "Pisces"],
    "Saturn": ["Capricorn", "Aquarius"],
}


def create_rulership_relationships(connector: Neo4jConnector) -> None:
    """각 행성과 별자리를 MATCH한 뒤 MERGE로 (Planet)-[:RULES]->(Sign) 관계를 생성합니다."""
    for planet_name, sign_names in RULERSHIP.items():
        for sign_name in sign_names:
            connector.run_query(
                """
                MATCH (p:Planet {name: $planet_name})
                MATCH (s:Sign {name: $sign_name})
                MERGE (p)-[:RULES]->(s)
                """,
                {"planet_name": planet_name, "sign_name": sign_name},
            )


if __name__ == "__main__":
    connector = None
    try:
        connector = Neo4jConnector()
        create_rulership_relationships(connector)
        print("고전 점성술 룰러십 연결 완료!")
    finally:
        if connector:
            connector.close()
