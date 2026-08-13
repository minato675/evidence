INSERT INTO `notices` (`id`, `type`, `title`, `version`, `content`, `author_email`, `published_at`, `created_at`) VALUES (
  'patch-v1-0-16-analysis-version-badge-readability',
  'patch',
  '분석 버전 표시와 최신 모델 안내 가독성 개선',
  'v1.0.16',
  '- 저장 논문 카드의 긴 모델명과 상태 문구를 v1·v2·v3 형태의 간결한 분석 버전 배지로 변경\n- 구버전 배지는 색상으로 구분하고 마우스를 올리거나 보조기기로 접근하면 최신화 가능 여부 안내\n- 최신 분석 모델 안내 글꼴을 확대하고 전문 분석·질의응답 RAG·사용 가능 논문 수를 구분해 표시\n- 넓은 화면에서는 정보 행이 가용 폭을 모두 사용하고 모바일에서는 세로형 카드로 전환해 텍스트 잘림 방지',
  'system@evidence-lab',
  1786503500000,
  1786503500000
);
