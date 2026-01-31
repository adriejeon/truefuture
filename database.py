"""
Neo4j 데이터베이스 연결 모듈 - 진짜미래(True Future) 점성술 서비스
"""

import os
from pathlib import Path

from dotenv import load_dotenv
from neo4j import GraphDatabase


# .dev.vars 파일 경로 (이 스크립트와 같은 디렉터리 기준)
_DEV_VARS_PATH = Path(__file__).resolve().parent / ".dev.vars"
load_dotenv(_DEV_VARS_PATH)


class Neo4jConnector:
    """Neo4j 데이터베이스 연결 및 쿼리 실행을 담당하는 클래스."""

    def __init__(self):
        uri = os.getenv("NEO4J_URI")
        user = os.getenv("NEO4J_USER")
        password = os.getenv("NEO4J_PASSWORD")

        if not uri or not user or not password:
            missing = []
            if not uri:
                missing.append("NEO4J_URI")
            if not user:
                missing.append("NEO4J_USER")
            if not password:
                missing.append("NEO4J_PASSWORD")
            raise ValueError(
                f"Neo4j 연결에 필요한 환경 변수가 없습니다: {', '.join(missing)}. "
                f".dev.vars 파일을 확인하거나 경로({_DEV_VARS_PATH})가 맞는지 확인하세요."
            )

        try:
            self._driver = GraphDatabase.driver(uri, auth=(user, password))
        except Exception as e:
            raise ConnectionError(
                f"Neo4j 드라이버 생성 실패: {e}. "
                "NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD를 확인하세요."
            ) from e

    def close(self) -> None:
        """드라이버 연결을 종료합니다."""
        if self._driver:
            self._driver.close()
            self._driver = None

    def verify_connection(self) -> None:
        """연결이 정상인지 확인하고 'Hello, True Future!' 쿼리 결과를 출력합니다."""
        try:
            with self._driver.session() as session:
                result = session.run("RETURN 'Hello, True Future!' AS message")
                record = result.single()
                if record:
                    print(record["message"])
                else:
                    print("쿼리 결과가 없습니다.")
        except Exception as e:
            raise ConnectionError(
                f"Neo4j 연결 확인 실패: {e}. "
                "데이터베이스가 실행 중인지, URI/인증 정보가 맞는지 확인하세요."
            ) from e

    def run_query(self, query: str, parameters: dict | None = None) -> list[dict]:
        """
        Cypher 쿼리를 실행하고 결과를 딕셔너리 리스트로 반환합니다.

        Args:
            query: 실행할 Cypher 쿼리 문자열.
            parameters: 쿼리에 바인딩할 파라미터 딕셔너리. None이면 빈 dict 사용.

        Returns:
            각 레코드를 딕셔너리로 변환한 리스트.
        """
        if parameters is None:
            parameters = {}

        try:
            with self._driver.session() as session:
                result = session.run(query, parameters)
                return [dict(record) for record in result]
        except Exception as e:
            raise RuntimeError(
                f"쿼리 실행 실패: {e}\n쿼리: {query}\n파라미터: {parameters}"
            ) from e

    def __enter__(self) -> "Neo4jConnector":
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        self.close()


if __name__ == "__main__":
    connector = None
    try:
        connector = Neo4jConnector()
        print("Neo4j 연결 성공. 검증 쿼리 결과:")
        connector.verify_connection()
    except (ValueError, ConnectionError) as e:
        print(f"오류: {e}")
    finally:
        if connector:
            connector.close()
            print("연결이 종료되었습니다.")
