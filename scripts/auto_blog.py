import json
import os
import random
import re
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone

import requests
from google import genai
from pydantic import BaseModel
from supabase import create_client


class BlogPost(BaseModel):
    title: str
    content: str
    slug: str
    excerpt: str
    tags: list[str]


@dataclass(frozen=True)
class DailyTopicSpec:
    """요일(UTC)별 고전 서양 점성술 주제와 문맥형 CTA 힌트."""

    topic: str
    cta_context: str
    allow_auxiliary_ephemeris_sites: bool


def get_daily_topic_and_cta() -> DailyTopicSpec:
    """
    `datetime.now(timezone.utc).weekday()` 기준 요일별 테마(UTC).
    월·화: 행성·별자리, 수·목: 하우스, 금: 어스펙트, 토: 트랜짓, 일: 종합 해석.
    """
    wd = datetime.now(timezone.utc).weekday()

    if wd == 0:  # 월 — 행성과 위계
        topic = (
            "고전 서양 점성술의 행성 위계(planetary hierarchy), 천상의 질(the natures of planets), "
            "그리고 본질적 가·불리(essential dignities / debilities)가 판단 논리에 끼치는 역할"
        )
        cta_context = (
            "독자가 우위·불리 표를 일일이 대조하지 않고도 출생차트에서 행성의 조건을 "
            "정리해 보고 싶은 상황을 가정해, 본문 논지와 맞닿게 연결할 것."
        )
        allow_auxiliary_ephemeris_sites = False
    elif wd == 1:  # 화 — 행성과 별자리의 결합
        topic = (
            "12개 별자리(sign)의 기본 성격과, 각 별자리가 어떤 행성의 '집(domicile)'인지 — "
            "행성과 별자리가 짝지어지는 고전적 원리, 그리고 같은 행성이라도 어느 별자리에 있느냐에 따라 "
            "표현이 어떻게 달라지는지"
        )
        cta_context = (
            "별자리 운세 정도만 들어본 독자가, 자신의 출생차트에서 행성이 어느 별자리에 있는지 "
            "확인하고 그 의미를 직관적으로 파악하고 싶을 때의 맥락으로 자연스럽게 연결할 것."
        )
        allow_auxiliary_ephemeris_sites = False
    elif wd == 2:  # 수 — 하우스
        topic = (
            "12하우스(whole-sign 등 고전 틀)와 각·속·떨어짐(angular, succedent, cadent)이 "
            "사건의 가중치에 주는 고전적 의미"
        )
        cta_context = (
            "하우스 강약과 각도를 한눈에 짚고 실생활 주제(일, 관계, 재정 등)로 옮기고 싶은 독자에게 "
            "닿는 흐름으로 연결할 것."
        )
        allow_auxiliary_ephemeris_sites = False
    elif wd == 3:  # 목 — 하우스 주인과 접수
        topic = (
            "하우스 주인(house rulers)과 접수(reception)가 겹칠 때 "
            "하우스 주제를 어떻게 단정·수정하는지에 대한 고전적 원칙"
        )
        cta_context = (
            "룰러 체인을 고려한 해석을 출생 정보에 맞춰 시험해 보고 싶은 독자의 "
            "상황을 상정해 연결할 것."
        )
        allow_auxiliary_ephemeris_sites = False
    elif wd == 4:  # 금 — 어스펙트
        topic = (
            "행성과 행성 사이의 각도(aspect): 컨정션·옵포지션·트라인·스퀘어·섹스타일의 "
            "고전적 의미와 차이, 그리고 어스펙트가 차트 해석에 어떤 식으로 무게를 더하는지"
        )
        cta_context = (
            "어스펙트라는 말은 들어봤지만 각 각도가 실제로 어떤 의미를 가지는지, "
            "본인 차트의 행성 관계를 어떻게 읽어야 할지 막연한 독자의 맥락으로 연결할 것."
        )
        allow_auxiliary_ephemeris_sites = False
    elif wd == 5:  # 토 — 트랜짓
        topic = (
            "본차트(radix) 대비 트랜짓: 주요 악셉트·하우스 접근, "
            "고전적 관점에서의 허용·거부 조건과 실무적 타이밍"
        )
        cta_context = (
            "여러 트랜짓을 동시에 고려할 때 우선순위를 세우거나 본인 일정에 맞춰 "
            "의미를 압축하고 싶은 독자에게 닿게 연결할 것."
        )
        allow_auxiliary_ephemeris_sites = False
    else:  # wd == 6, 일 — 출생 차트 종합 해석
        topic = (
            "출생 차트를 처음부터 끝까지 어떻게 읽어야 하는지 — 행성·별자리·하우스·각도를 "
            "한 번에 보는 종합 해석의 순서와, 초보자가 자주 막히는 지점에 대한 고전적 안내"
        )
        cta_context = (
            "차트 이미지는 받아 봤지만 어디서부터 봐야 할지 몰라 막막한 독자가 "
            "한 번에 정리된 해석을 받아 보고 싶을 때의 맥락으로 연결할 것."
        )
        allow_auxiliary_ephemeris_sites = False

    return DailyTopicSpec(
        topic=topic,
        cta_context=cta_context,
        allow_auxiliary_ephemeris_sites=allow_auxiliary_ephemeris_sites,
    )


def _slugify(value: str) -> str:
    value = (value or "").strip().lower()
    value = re.sub(r"[^a-z0-9가-힣\s-]", "", value)
    value = re.sub(r"\s+", "-", value).strip("-")
    value = re.sub(r"-{2,}", "-", value)
    return value[:80] or "post"


def _slug_suffix() -> str:
    now = datetime.now(timezone.utc)
    return f"{now.strftime('%Y%m%d')}-{now.strftime('%H%M%S')}-{random.randint(1000, 9999)}"


_QA_STRUCTURE_RULES = """
구성은 '질문 → 바로 답' 형식으로 짠다 (이게 이 글에서 가장 중요한 규칙이다. AI 검색·LLM이 답변을 그대로 인용하기 좋게 만들기 위함):
- 제목(title)은 독자가 실제로 검색하거나 머릿속에 떠올리는 '질문 한 문장'으로 만든다. 예: "...뭐가 더 정확할까?", "...언제 보는 게 좋을까?", "...무슨 차이가 있을까?". 물음표로 끝나는 자연스러운 한국어 질문.
- 본문 맨 첫 1~2문장에서 그 질문에 대한 결론(직접적인 답)을 먼저 단정적으로 말한다. 배경 설명이나 뜸 들이기로 시작하지 마라. 이 첫 답변 문장은 그것만 떼어 읽어도 뜻이 완결되는, 인용 가능한 한 문장이어야 한다.
- 결론을 먼저 말한 다음에 근거와 설명을 잇는다 (두괄식).
- 본문 중간의 H2/H3 소제목도 가능한 한 독자가 이어서 궁금해할 '질문 형태'(물음표로 끝나는 문장)로 단다. 그리고 각 섹션도 첫 문장에서 답을 먼저 제시한 뒤 풀어 설명한다.
- 각 질문에 대한 답은 '검색 결과 스니펫'처럼, 한 문장만 읽어도 의미가 통하도록 자기완결적으로 쓴다.
""".strip()


def _build_prompt(
    topic: str,
    cta_context: str,
    allow_auxiliary_ephemeris_sites: bool,
) -> str:
    if allow_auxiliary_ephemeris_sites:
        external_tools_block = (
            "보조 도구는 천체력이나 정밀한 트랜짓 날짜 계산을 다룰 때만, "
            "Astro.com 또는 Astro-Seek 중 하나를 본문 흐름 속에서 한 번 정도 가볍게 언급해도 된다. "
            "사이트 랭킹, 나열, 비교표, 제휴성 표현은 절대 쓰지 마."
        )
    else:
        external_tools_block = (
            "Astro.com, Astro-Seek 같은 외부 사이트는 이 주제에서는 굳이 언급하지 마."
        )

    return f"""
역할: 한국에서 활동하는 고전 서양 점성술(전통 점성술) 전문 상담가가 자신의 블로그에 올리는 글이다.
독자는 점성술을 처음 접하지만 가벼운 운세 콘텐츠보다는 좀 더 깊이 있는 설명을 원하는 사람이다.

지키는 범위:
- 다루는 주제는 오직 고전 서양 점성술(전통 점성술)이다.
- 사주명리, 오행, 십성, 타로, 주역, 풍수, 신점 같은 다른 점법은 절대로 끌어들이지 말고 비교도 하지 않는다.

톤 & 어휘(전문성을 살린다):
- 점성술 전공자의 어휘를 그대로 쓴다. 행성의 '집'은 '하우스(house)' 또는 '도미사일(domicile)', '품격/위계'는 '디그니티(dignity)', 그 반대는 '디트리먼트(detriment)'/'폴(fall)', 별자리는 '사인(sign)', 각도는 '어스펙트(aspect)'(컨정션·옵포지션·트라인·스퀘어·섹스타일)로 부른다. "방", "기운 좋은 자리", "사이가 안 좋은 자리" 같은 일상어 치환은 가능하면 쓰지 않는다.
- 전문 용어가 본문에 처음 나올 때는 한 번만 괄호로 짧은 정의를 곁들인다. 예: "각도(어스펙트, aspect)는 행성과 행성 사이의 떨어진 각도를 말한다." 두 번째부터는 정의 없이 용어만 쓴다.
- 영어 원어 병기는 정의해 줄 때 한 번만. 본문 전체에 영어를 도배하지 않는다.
- 종결 어미는 '-다/이다' 평서체를 기본으로 한다. 강의·논문처럼 딱딱하게 가지 말고, 차분하고 단정한 전문가의 말투를 유지한다. "~예요/거든요/답니다" 같은 친근체로 빠지지 않는다.
- 추상어("에너지", "기운", "본질")로 도망가지 말고, 직장·연애·가족 관계 같은 구체적인 장면으로 의미를 보여 준다.
- 첫 문단은 "고전 점성술에서 X는…" 같은 백과사전식 정의 대신, 제목으로 던진 질문에 대한 결론(직접적인 답)을 먼저 한두 문장으로 분명히 말하고 시작한다.

문장·구성:
- 한 문단은 3~5문장 정도, 길어진 문장은 둘로 끊는다. 같은 단어를 한 문단에서 반복하지 않는다.
- "세 가지 축", "다섯 가지 핵심 포인트" 같은 인위적 번호 목차는 만들지 않는다. 문맥이 자연스럽게 흐르도록 구성한다.
- 같은 단어를 한 글에서 두 번 이상 굵게 강조하지 않고, 굵은 부분이 한 글에서 4~7개를 넘지 않게 한다.

마크다운 규칙(아주 중요, 어기면 안 됨):
- 문단과 문단 사이에는 반드시 빈 줄 한 줄을 띄워. 즉 `\\n\\n` 형태로 문단을 구분해.
  하나의 문단은 한 덩어리 생각이고, 다음 생각으로 넘어갈 때는 무조건 빈 줄 한 줄 넣어. 한 줄 띄움만으로는 화면에서 문단이 안 떨어져.
- 제목은 ## (H2)와 ### (H3)만 써. H1(#)은 쓰지 마. H2/H3 위아래에도 빈 줄 한 줄씩 넣어.
- 굵게(`**텍스트**`)는 핵심 개념이나 한 문장의 키 메시지를 짚을 때만, 한 글에서 4~7번 정도까지만 써. 같은 단어를 두 번 이상 굵게 강조하지 마.
- 굵게 강조에 한국어 조사를 직접 붙이지 마. 닫는 `**` 바로 다음에는 공백이나 문장부호가 오게 해.
  (이유: `**행성**은` 같은 패턴은 일부 렌더러에서 별표가 그대로 보일 수 있어. 한국어 조사가 붙어야 하면 굵게 부분을 줄여서 조사 앞에서 끊어.)
  좋음: "이 자리를 고전에서는 **도미사일(domicile)**이라고 부른다." (닫는 ** 다음이 "이라고"라 조사 직결은 아님. 더 안전한 패턴은 "고전에서는 이를 **도미사일**, 즉 본거지로 본다." 처럼 닫는 ** 다음에 쉼표/공백을 두는 형태)
  베스트: "고전에서는 행성을 일종의 **그릇**으로 본다." ← 닫는 ** 다음이 "으로"(공백 없이도 어절 경계)
  나쁨: "**행성**은 천체이다." ← 닫는 ** 바로 뒤에 조사 '은' 직결 (금지)
  나쁨: "**진짜미래**를 추천한다." ← 닫는 ** 바로 뒤에 조사 '를' 직결 (금지)
  요령: 굵게 처리할 어절을 잡을 때 그 뒤에 공백·쉼표·마침표가 오도록 문장 구조를 짜. 안 되면 그 단어는 굵게 처리하지 마.
- 기울임(`*텍스트*`, `_텍스트_`)과 밑줄은 본문에서 쓰지 마. 한국어에는 기울임 표현이 어색해.
- 글머리표(`- `)는 정말 나열이 필요할 때만 써. 본문은 가능하면 줄글로 풀어 써. 글머리표를 쓸 때도 위아래에 빈 줄을 둬.

CTA(살짝만, 자연스럽게):
- 글 맨 끝에 진짜미래(truefuture.kr) 서비스를 한 번만, 한두 문장으로 자연스럽게 권유해. 본문 흐름 안에 녹여서, 광고처럼 들리지 않게.
- 서비스 이름은 그대로 '진짜미래(truefuture.kr)' 라고만 적어. 별표로 감싸지 마.
- "TOP 3", "최고의", "강력 추천" 같은 광고 문구 금지. 랭킹이나 비교표도 금지.
- 아래 CTA 맥락을 참고해서 자연스럽게 연결해.
  CTA 맥락: {cta_context}

{external_tools_block}

오늘 다룰 주제(이걸 그대로 베끼지 말고, 일반인이 읽기 좋게 풀어서 설명해):
{topic}

{_QA_STRUCTURE_RULES}

분량과 구성:
- 한국어 기준 1500~2200자 정도. 너무 짧지도, 너무 길지도 않게.
- 도입(결론 먼저) → 본론(2~3개의 질문형 H2 섹션) → 마무리 + 가벼운 CTA 한 단락.
- 제목(title)은 클릭하고 싶어지는 한국어 질문 한 줄(물음표로 끝나게). 영어 용어 나열 금지.

반드시 아래 JSON 스키마로만 응답해:
{{
  "title": "...",
  "content": "...",
  "slug": "...",
  "excerpt": "...",
  "tags": ["키워드1", "키워드2", "키워드3"]
}}

응답 규칙:
- 응답은 오직 JSON만. 코드펜스(```)나 다른 설명 텍스트 금지.
- content는 마크다운으로 작성해. 문단은 빈 줄(`\\n\\n`)로 반드시 구분하고, 헤더는 ##/###만 사용해.
- 굵게(`**`)는 위 규칙대로 핵심 어절에만 절제해서 쓰고, 닫는 `**` 뒤에 한국어 조사가 직접 붙지 않도록 문장을 구성해.
- excerpt는 한국어 한두 문장으로, 검색 결과에서 클릭하고 싶어질 만한 짧은 미리보기. excerpt에는 굵게/마크다운 쓰지 마, 평문으로만.
- tags는 SEO용 한국어 키워드 3~5개 문자열 배열. 사주, 타로 등 비(非)고전 서양 점성술 키워드는 절대 넣지 마.
""".strip()


# ── 라이트/일반 트랙 ──────────────────────────────────────────────
# 점성술 전문 글과 별개로, 일반인이 검색할 법한 '비교/상황별 추천/시즌성' 질문을
# 다룬다. 사주·타로와의 비교를 허용하되, 공정하게 다루면서 점성술(특히 출생 차트
# 기반 정통 점성술)과 진짜미래로 자연스럽게 연결한다.
_LIGHT_TOPICS: tuple[tuple[str, str], ...] = (
    (
        "점성술, 사주, 타로 중에서 무엇이 가장 정확하고 신빙성이 있을까?",
        "세 가지를 '틀렸다/맞다'로 우열 매기지 말고, 각각이 무엇을 잘 보는지(타이밍·기질·구체적 선택)를 짚은 뒤, "
        "출생 시각 기반의 정통 점성술이 왜 개인 맞춤 해석에 강한지로 자연스럽게 이어 진짜미래를 권한다.",
    ),
    (
        "고민 상황별로 점성술·사주·타로 중에 무엇을 보는 게 좋을까?",
        "연애·이직·금전·건강 같은 상황별로 어떤 점법이 잘 맞는지 가이드하고, "
        "출생 차트로 큰 흐름을 보고 싶을 때 진짜미래가 적합하다는 식으로 연결한다.",
    ),
    (
        "신년에는 무슨 운세(신년운세)를 보는 게 좋을까?",
        "새해에 한 해 흐름을 점검하려는 독자에게 연간 운세를 보는 의미와 방법을 알려 주고, "
        "출생 차트 기반 연간 운세를 진짜미래에서 볼 수 있게 자연스럽게 안내한다.",
    ),
    (
        "사주와 서양 점성술은 무엇이 어떻게 다를까?",
        "동양 사주와 서양 점성술의 관점 차이를 쉽게 비교하고, 둘 다 의미가 있지만 "
        "태어난 시각·장소까지 반영하는 점성술의 개인화 강점으로 진짜미래를 연결한다.",
    ),
    (
        "타로와 점성술은 뭐가 다르고, 각각 언제 보면 좋을까?",
        "타로는 지금 이 순간의 질문, 점성술은 타고난 큰 흐름이라는 식으로 쓰임새를 구분해 주고, "
        "내 전체 그림을 보고 싶을 때 출생 차트 기반의 진짜미래가 좋다는 흐름으로 연결한다.",
    ),
    (
        "연애나 재회가 고민일 때는 어떤 점을 보는 게 좋을까?",
        "연애·재회 고민에서 각 점법이 어떤 답을 주는지 비교하고, "
        "내 연애 기질과 타이밍을 출생 차트로 보고 싶을 때 진짜미래를 권한다.",
    ),
    (
        "별자리 운세와 정통 점성술(출생 차트)은 무엇이 다를까?",
        "흔한 '12별자리 오늘의 운세'와, 태어난 시각까지 계산하는 정통 점성술의 차이를 분명히 알려 주고, "
        "제대로 된 개인 해석을 원할 때 진짜미래를 안내한다.",
    ),
    (
        "점성술을 보려면 태어난 시간이 꼭 필요할까?",
        "출생 시각이 왜 중요한지(상승궁·하우스) 쉽게 설명하고, 시각을 알면 훨씬 정밀한 해석이 가능하다는 점에서 "
        "진짜미래의 출생 차트 분석으로 자연스럽게 연결한다.",
    ),
    (
        "처음 운세를 본다면 무엇부터 보는 게 좋을까?",
        "입문자가 막막하지 않게 순서를 제안하고, 한 번에 큰 그림을 잡기 좋은 출생 차트 해석을 "
        "진짜미래에서 시작해 볼 수 있게 안내한다.",
    ),
    (
        "무료 운세와 유료 점성술 상담은 무엇이 다를까?",
        "무료 콘텐츠의 한계(일반론)와 개인 맞춤 해석의 차이를 솔직하게 짚고, "
        "합리적인 비용으로 전문가 로직을 구현한 진짜미래로 연결한다.",
    ),
    (
        "궁합은 사주 궁합과 점성술 궁합 중 무엇으로 보는 게 좋을까?",
        "두 궁합의 보는 방식 차이를 비교하고, 두 사람의 출생 차트를 함께 보는 점성술 궁합의 강점으로 "
        "진짜미래 궁합 분석을 자연스럽게 권한다.",
    ),
    (
        "점성술은 미신일까, 아니면 근거가 있는 걸까?",
        "점성술을 '미신 대 과학'의 이분법이 아니라 오랜 관찰 체계로 차분하게 설명하고, "
        "맹신이 아닌 참고 도구로서 출생 차트 해석을 진짜미래에서 받아 보도록 안내한다.",
    ),
)


def get_daily_light_topic() -> tuple[str, str]:
    """날짜(UTC) 기준으로 라이트 주제를 순환 선택한다. (요일 무관, 매일 다른 주제)"""
    yday = datetime.now(timezone.utc).timetuple().tm_yday
    return _LIGHT_TOPICS[yday % len(_LIGHT_TOPICS)]


def _build_light_prompt(topic: str, cta_context: str) -> str:
    return f"""
역할: 점성술·사주·타로를 두루 아는 친절한 가이드가, 운세에 관심 있는 일반 독자를 위해 쓰는 블로그 글이다.
독자는 점성술을 잘 모르는 일반인이고, 전문 용어보다 "그래서 나는 뭘 보면 되는데?"에 대한 명쾌한 답을 원한다.

이 글의 목적:
- 일반인이 검색할 법한 질문에, 쉽고 명확하게 답한다.
- 사주·타로와의 비교를 다루되, 어느 하나를 깎아내리지 않는다. "사주는 틀렸다" 같은 표현은 절대 금지.
- 각 점법이 '무엇을 잘 보는지'를 공정하게 알려 주면서도, 결론적으로는 태어난 시각·장소까지 반영하는 정통 점성술(출생 차트)의 개인 맞춤 강점을 분명히 짚고, 진짜미래(truefuture.kr)로 자연스럽게 이어 준다.

톤 & 어휘(쉽고 신뢰감 있게):
- 어려운 전문 용어는 최소화한다. 꼭 필요한 용어(예: 출생 차트, 상승궁)는 한 번만 짧게 괄호로 풀어 준다.
- 종결 어미는 '-다/이다' 평서체를 기본으로 하되, 너무 딱딱하지 않게 차분하고 친근한 전문가 톤을 유지한다. "~예요/거든요" 같은 지나친 구어체로 빠지지 않는다.
- "에너지", "기운" 같은 추상어로 도망가지 말고, 연애·이직·금전 같은 구체적 장면으로 보여 준다.
- 사주·타로를 설명할 때는 정확하고 존중하는 태도로 다룬다. 비교표나 점수 매기기는 하지 않는다.

{_QA_STRUCTURE_RULES}

마크다운 규칙(아주 중요, 어기면 안 됨):
- 문단과 문단 사이에는 반드시 빈 줄 한 줄을 띄워. 즉 `\\n\\n` 형태로 문단을 구분해.
- 제목은 ## (H2)와 ### (H3)만 써. H1(#)은 쓰지 마. H2/H3 위아래에도 빈 줄 한 줄씩 넣어.
- 굵게(`**텍스트**`)는 핵심 메시지에만, 한 글에서 4~7번 정도까지만 써. 같은 단어를 두 번 이상 굵게 강조하지 마.
- 굵게 강조의 닫는 `**` 바로 다음에는 한국어 조사를 직접 붙이지 마. 닫는 `**` 다음에는 공백이나 문장부호가 오게 문장을 구성해. (예: "**진짜미래**를" 처럼 조사 직결은 금지)
- 기울임(`*텍스트*`, `_텍스트_`)과 밑줄은 쓰지 마.
- 글머리표(`- `)는 정말 나열이 필요할 때만. 본문은 가능하면 줄글로 풀어 써.

CTA(살짝만, 자연스럽게):
- 글 맨 끝에 진짜미래(truefuture.kr) 서비스를 한 번만, 한두 문장으로 자연스럽게 권유해. 본문 흐름 안에 녹여서, 광고처럼 들리지 않게.
- 서비스 이름은 그대로 '진짜미래(truefuture.kr)' 라고만 적어. 별표로 감싸지 마.
- "TOP 3", "최고의", "강력 추천" 같은 광고 문구 금지. 랭킹이나 비교표도 금지.
- 아래 CTA 맥락을 참고해서 자연스럽게 연결해.
  CTA 맥락: {cta_context}

오늘 다룰 질문(이 질문을 제목으로 삼되, 더 자연스러운 한국어로 다듬어도 된다):
{topic}

분량과 구성:
- 한국어 기준 1200~1800자 정도. 쉽고 술술 읽히게.
- 도입(질문에 대한 결론 먼저) → 본론(2~3개의 질문형 H2 섹션) → 마무리 + 가벼운 CTA 한 단락.

반드시 아래 JSON 스키마로만 응답해:
{{
  "title": "...",
  "content": "...",
  "slug": "...",
  "excerpt": "...",
  "tags": ["키워드1", "키워드2", "키워드3"]
}}

응답 규칙:
- 응답은 오직 JSON만. 코드펜스(```)나 다른 설명 텍스트 금지.
- content는 마크다운으로 작성해. 문단은 빈 줄(`\\n\\n`)로 반드시 구분하고, 헤더는 ##/###만 사용해.
- excerpt는 한국어 한두 문장으로, 검색 결과에서 클릭하고 싶어질 만한 짧은 미리보기. 평문으로만(마크다운 금지).
- tags는 SEO용 한국어 키워드 3~5개 문자열 배열. 이 글은 비교/일반 주제이므로 '점성술', '사주', '타로', '운세', '신년운세', '궁합' 같은 일반 키워드를 자연스럽게 포함해도 된다.
""".strip()


_KOREAN_JOSA = (
    "은는이가을를과와의로으로에게서께서도만조차마저까지부터처럼보다이나거나"
    "라고라며이라고이라며이며이라서라서이라서이라"
)


def _sanitize_markdown(text: str) -> str:
    """잘 형성된 `**굵게**` 쌍은 보존하고, 짝 안 맞는 별표/언더스코어와
    한국어 기울임 마크업만 정리한다. 닫는 `**` 바로 뒤에 한국어 조사가
    직결되어 일부 렌더러에서 별표가 노출되는 패턴은 별표 안쪽으로 조사를
    당겨 안전하게 만든다."""
    if not isinstance(text, str):
        return text

    # 0) `** 텍스트 **` 처럼 안쪽 공백이 있는 경우 — 닫힘이 안 되니 공백 제거
    text = re.sub(r"\*\*\s+([^\n*]+?)\s+\*\*", r"**\1**", text)

    # 1) 잘 형성된 `**...**` 쌍을 임시 토큰으로 보호. 한 줄 안, 양끝 비공백.
    bold_pair_re = re.compile(r"\*\*(?=\S)([^\n*]+?)(?<=\S)\*\*")

    placeholders: list[str] = []

    def _keep_pair(match: "re.Match[str]") -> str:
        inner = match.group(1)
        placeholders.append(inner)
        return f"\x00BOLD{len(placeholders) - 1}\x00"

    text = bold_pair_re.sub(_keep_pair, text)

    # 2) 보호 토큰 밖에 남은 짝 안 맞는 `**`, `*`, `__`, `_` 정리
    text = text.replace("**", "")
    text = re.sub(r"(?<!\*)\*(?!\*)", "", text)
    text = text.replace("__", "")
    text = re.sub(r"(?<!_)_(?!_)", "", text)

    # 3) 보호된 굵게 쌍 복원. 단, 닫는 `**` 바로 뒤가 한국어 조사면
    #    조사를 굵게 안쪽으로 흡수시켜 렌더러 호환 패턴으로 만든다.
    josa_pattern = re.compile(rf"\x00BOLD(\d+)\x00([{_KOREAN_JOSA}]+)")

    def _absorb_josa(match: "re.Match[str]") -> str:
        idx = int(match.group(1))
        josa = match.group(2)
        return f"**{placeholders[idx]}{josa}**"

    text = josa_pattern.sub(_absorb_josa, text)

    def _restore(match: "re.Match[str]") -> str:
        idx = int(match.group(1))
        return f"**{placeholders[idx]}**"

    text = re.sub(r"\x00BOLD(\d+)\x00", _restore, text)

    return text


def _normalize_paragraph_breaks(text: str) -> str:
    """3개 이상 연속 개행은 2개로 줄이고, 헤더(##/###) 위아래는 빈 줄을
    보장한다. 단일 개행을 이중 개행으로 강제하지는 않는다(리스트/인용 구조
    파괴 방지)."""
    if not isinstance(text, str):
        return text

    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)

    # 헤더 위에 빈 줄 보장
    text = re.sub(r"([^\n])\n(#{2,3} )", r"\1\n\n\2", text)
    # 헤더 다음에 빈 줄 보장
    text = re.sub(r"^(#{2,3} [^\n]*)\n(?!\n|#)", r"\1\n\n", text, flags=re.MULTILINE)

    return text.strip() + "\n"


def _safe_json_loads(text: str):
    if not isinstance(text, str):
        return None
    t = text.strip()
    t = re.sub(r"^```(?:json)?\s*", "", t, flags=re.IGNORECASE)
    t = re.sub(r"\s*```$", "", t)
    try:
        return json.loads(t)
    except Exception:
        m = re.search(r"\{[\s\S]*\}\s*$", t)
        if not m:
            return None
        try:
            return json.loads(m.group(0))
        except Exception:
            return None


def _extract_text_from_genai_response(resp) -> str:
    text = getattr(resp, "text", None)
    if isinstance(text, str) and text.strip():
        return text

    candidates = getattr(resp, "candidates", None) or []
    if candidates:
        content = getattr(candidates[0], "content", None)
        parts = getattr(content, "parts", None) or []
        if parts:
            t = getattr(parts[0], "text", None)
            if isinstance(t, str) and t.strip():
                return t

    return ""


def _is_transient_genai_error(e: Exception) -> bool:
    msg = (str(e) or "").lower()
    transient_markers = [
        "503",
        "429",
        "unavailable",
        "resource_exhausted",
        "high demand",
        "rate limit",
        "ratelimit",
        "too many requests",
        "temporarily",
        "timeout",
        "timed out",
        "connection reset",
        "connection aborted",
        "connection error",
        "service unavailable",
    ]
    if any(m in msg for m in transient_markers):
        return True

    code = getattr(e, "code", None)
    if isinstance(code, int) and code in (429, 503):
        return True

    status_code = getattr(e, "status_code", None)
    if isinstance(status_code, int) and status_code in (429, 503):
        return True

    return False


def generate_post(
    gemini_api_key: str,
    prompt: str,
    base_tags: list[str] | None = None,
) -> dict:
    client = genai.Client(api_key=gemini_api_key)

    last_err: Exception | None = None
    for attempt in range(1, 4):
        try:
            resp = client.models.generate_content(
                model="gemini-3.1-pro-preview",
                contents=prompt,
                config={
                    "response_mime_type": "application/json",
                    "response_schema": BlogPost,
                    "temperature": 0.9,
                    "max_output_tokens": 12000,
                },
            )
            last_err = None
            break
        except Exception as e:
            last_err = e
            if _is_transient_genai_error(e) and attempt < 3:
                print(
                    f"[auto_blog] transient error on Gemini call (attempt {attempt}/3): {e}. retrying in 30s...",
                    file=sys.stderr,
                )
                time.sleep(30)
                continue
            raise

    if last_err is not None:
        raise last_err

    text = _extract_text_from_genai_response(resp)
    data = _safe_json_loads(text)
    if not isinstance(data, dict):
        raise ValueError(f"Gemini JSON 파싱 실패. raw={text[:500]}")

    raw_title = (data.get("title") or "").strip()
    raw_content = (data.get("content") or "").strip()
    slug = (data.get("slug") or "").strip()
    raw_excerpt = (data.get("excerpt") or "").strip()
    tags = data.get("tags")

    # 제목은 굵게 마크업이 들어와도 평문화(렌더러에 따라 이상해질 수 있음)
    title = re.sub(r"\*\*(.+?)\*\*", r"\1", raw_title, flags=re.DOTALL)
    title = re.sub(r"[*_]", "", title).strip()

    # 본문은 굵게 쌍을 살리되 짝 안 맞는 별표/조사 직결 패턴 정리
    content = _normalize_paragraph_breaks(_sanitize_markdown(raw_content))

    # 미리보기(excerpt)는 평문만
    excerpt = re.sub(r"\*\*(.+?)\*\*", r"\1", raw_excerpt, flags=re.DOTALL)
    excerpt = re.sub(r"[*_`#>]+", "", excerpt).strip()

    if not title or not content:
        raise ValueError("Gemini 응답에 title/content가 비어 있습니다.")

    base_slug = _slugify(slug) if slug else _slugify(title)
    final_slug = f"{base_slug}-{_slug_suffix()}"

    if not excerpt:
        excerpt = (re.sub(r"\s+", " ", re.sub(r"[#*_>`-]+", " ", content)).strip())[:160]

    if isinstance(tags, list):
        tags = [str(t).strip() for t in tags if str(t).strip()]
    else:
        tags = []

    if not base_tags:
        base_tags = ["고전점성술", "점성학", "출생차트", "별자리", "행성"]
    for t in base_tags:
        if len(tags) >= 3:
            break
        if t not in tags:
            tags.append(t)
    tags = tags[:5]

    return {
        "title": title,
        "content": content,
        "slug": final_slug,
        "excerpt": excerpt,
        "tags": tags,
    }


def _trigger_cloudflare_hook(hook_url: str | None) -> None:
    if not hook_url:
        return
    try:
        requests.post(hook_url, timeout=15)
    except Exception:
        return


def insert_post_to_supabase(supabase_url: str, service_role_key: str, post: dict) -> dict:
    sb = create_client(supabase_url, service_role_key)
    payload = {
        "title": post["title"],
        "content": post["content"],
        "excerpt": post["excerpt"],
        "tags": post.get("tags", []),
        "slug": post["slug"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    res = sb.table("posts").insert(payload).execute()
    return {"inserted": True, "data": getattr(res, "data", None), "slug": post["slug"]}


def main() -> int:
    try:
        gemini_api_key = os.getenv("GEMINI_API_KEY")
        supabase_url = os.getenv("SUPABASE_URL")
        supabase_service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        cloudflare_hook_url = os.getenv("CLOUDFLARE_DEPLOY_HOOK_URL")

        missing = [
            k
            for k, v in {
                "GEMINI_API_KEY": gemini_api_key,
                "SUPABASE_URL": supabase_url,
                "SUPABASE_SERVICE_ROLE_KEY": supabase_service_role_key,
            }.items()
            if not v
        ]
        if missing:
            raise ValueError(f"환경변수 누락: {', '.join(missing)}")

        # 1) 심화(고전 점성술 전문) 글 — 요일별 주제 로테이션
        deep_spec = get_daily_topic_and_cta()
        deep_prompt = _build_prompt(
            deep_spec.topic,
            deep_spec.cta_context,
            deep_spec.allow_auxiliary_ephemeris_sites,
        )

        # 2) 라이트(일반인 대상 비교/상황별/시즌성) 글 — 날짜별 주제 로테이션
        light_topic, light_cta = get_daily_light_topic()
        light_prompt = _build_light_prompt(light_topic, light_cta)

        tracks = [
            ("deep", deep_prompt, None),
            (
                "light",
                light_prompt,
                ["점성술", "사주", "타로", "운세", "신년운세"],
            ),
        ]

        published = 0
        last_error: Exception | None = None
        for name, prompt, base_tags in tracks:
            try:
                post = generate_post(gemini_api_key, prompt, base_tags=base_tags)
                result = insert_post_to_supabase(
                    supabase_url, supabase_service_role_key, post
                )
                rows = len(result.get("data") or [])
                print(
                    f"[auto_blog] track={name} inserted={result.get('inserted')} "
                    f"slug={result.get('slug')} rows={rows}"
                )
                published += 1
            except Exception as track_err:
                last_error = track_err
                print(
                    f"[auto_blog] track={name} 실패: {track_err}",
                    file=sys.stderr,
                )

        if published == 0:
            raise last_error or RuntimeError("발행된 글이 없습니다.")

        # 한 글이라도 발행됐으면 배포 훅을 한 번만 호출
        _trigger_cloudflare_hook(cloudflare_hook_url)
        print(f"[auto_blog] 총 {published}/{len(tracks)}개 발행 완료")
        return 0
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
