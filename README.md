# True Future Backend

서양 점성술 서비스 'True Future'의 Cloudflare Workers 기반 백엔드입니다.

## 프로젝트 구조

```
true-future-backend/
├── src/
│   └── index.js          # 메인 엔트리 포인트 (ES Module)
├── wrangler.toml         # Cloudflare Workers 설정
├── package.json          # 프로젝트 의존성 및 스크립트
└── README.md            # 프로젝트 문서
```

## 설치

```bash
npm install
```

## 필요한 라이브러리 설치

```bash
npm install @fusionstrings/swiss-eph @supabase/supabase-js
```

## 개발 서버 실행

```bash
npm run dev
```

## 배포

```bash
npm run deploy
```

## 기술 스택

- **Runtime**: Cloudflare Workers
- **점성술 계산**: @fusionstrings/swiss-eph
- **데이터베이스**: Supabase (@supabase/supabase-js)
