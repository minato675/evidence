INSERT INTO `notices` (`id`, `type`, `title`, `version`, `content`, `author_email`, `published_at`, `created_at`) VALUES (
  'patch-v1-0-20-verified-pdf-storage-repair',
  'patch',
  'PDF 원본 저장 검증 및 자동 복구 개선',
  'v1.0.20',
  '- PDF 제목과 DOI 추출 전에 원본 파일을 먼저 안전하게 저장하도록 처리 순서 수정\n- 저장 직후 실제 저장된 파일 크기를 확인하고 불일치 시 라이브러리 등록을 중단하도록 검증 추가\n- PDF 목록 정보만 남고 원본이 없던 손상 기록은 동일 DOI 파일을 다시 업로드하면 자동 정리 후 교체\n- 원본 저장 실패와 사전분석 실패를 구분해 재업로드가 필요한 경우를 명확하게 안내\n- 중복 논문 업로드 시 새로 임시 저장한 원본 파일을 안전하게 정리',
  'system@evidence-lab',
  1786512000000,
  1786512000000
);
