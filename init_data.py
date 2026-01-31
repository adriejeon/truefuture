"""
진짜미래(True Future) 서비스를 위한 기초 점성술 데이터를 Neo4j에 적재하는 스크립트
점성술 3대 요소: Planets(행성), Signs(별자리), Houses(하우스)
"""

from database import Neo4jConnector


# 행성 7개
PLANETS = [
    "Sun",
    "Moon",
    "Mercury",
    "Venus",
    "Mars",
    "Jupiter",
    "Saturn",
]

# 별자리 12개
SIGNS = [
    "Aries",
    "Taurus",
    "Gemini",
    "Cancer",
    "Leo",
    "Virgo",
    "Libra",
    "Scorpio",
    "Sagittarius",
    "Capricorn",
    "Aquarius",
    "Pisces",
]

# 하우스 12개 (1~12)
HOUSES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]


def create_constraints(connector: Neo4jConnector) -> None:
    """Planet.name, Sign.name, House.number에 유니크 제약 조건을 생성합니다. 이미 있으면 무시합니다."""
    connector.run_query(
        "CREATE CONSTRAINT planet_name_unique IF NOT EXISTS "
        "FOR (p:Planet) REQUIRE p.name IS UNIQUE"
    )
    connector.run_query(
        "CREATE CONSTRAINT sign_name_unique IF NOT EXISTS "
        "FOR (s:Sign) REQUIRE s.name IS UNIQUE"
    )
    connector.run_query(
        "CREATE CONSTRAINT house_number_unique IF NOT EXISTS "
        "FOR (h:House) REQUIRE h.number IS UNIQUE"
    )


def load_planets(connector: Neo4jConnector) -> None:
    """행성 노드를 MERGE로 생성합니다."""
    for name in PLANETS:
        connector.run_query("MERGE (p:Planet {name: $name})", {"name": name})


def load_signs(connector: Neo4jConnector) -> None:
    """별자리 노드를 MERGE로 생성합니다."""
    for name in SIGNS:
        connector.run_query("MERGE (s:Sign {name: $name})", {"name": name})


def load_houses(connector: Neo4jConnector) -> None:
    """하우스 노드를 MERGE로 생성합니다."""
    for number in HOUSES:
        connector.run_query("MERGE (h:House {number: $number})", {"number": number})


if __name__ == "__main__":
    connector = None
    try:
        connector = Neo4jConnector()
        create_constraints(connector)
        load_planets(connector)
        load_signs(connector)
        load_houses(connector)
        print(f"행성 {len(PLANETS)}개, 별자리 {len(SIGNS)}개, 하우스 {len(HOUSES)}개 생성 완료!")
    finally:
        if connector:
            connector.close()
