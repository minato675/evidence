INSERT INTO `notices` (`id`, `type`, `title`, `version`, `content`, `author_email`, `published_at`, `created_at`) VALUES (
  'patch-v1-0-14-academic-plain-text-100mb-layout',
  'patch',
  '논문 서식 정리와 대용량 PDF 업로드 개선',
  'v1.0.14',
  '- 논문 제목·초록에 포함된 i, sub 등 출판사 HTML/JATS 태그를 일반 텍스트로 자동 변환\n- i-MAX, M2AX 같은 학술 용어와 조성식이 태그 없이 표시되고 동일한 일반 텍스트로 검색되도록 개선\n- 기존 저장 논문·검색 캐시·상세 화면·관리자 화면에도 같은 정리 규칙 적용\n- PDF 파일당 업로드 한도를 10MB에서 100MB로 확대하고 클라이언트·서버·사용법 안내를 일치시킴\n- 저장 논문과 AI 분석 고정 구역의 높이를 함께 늘리고 저장 논문 상단 제어 영역의 겹침 방지',
  'system@evidence-lab',
  1786501138544,
  1786501138544
);
