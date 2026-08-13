INSERT INTO `notices` (`id`, `type`, `title`, `version`, `content`, `author_email`, `published_at`, `created_at`) VALUES (
  'patch-v1-0-17-reliable-multi-pdf-upload',
  'patch',
  '다중 PDF 업로드 안정성 개선',
  'v1.0.17',
  '- 신규 파일 업로드 전에 기존 PDF 전체를 다시 분석하던 무거운 DOI 정리 작업을 업로드 경로에서 분리\n- 신규 PDF의 DOI 중복 검사는 각 파일 업로드 단계에서 계속 수행\n- 서버 응답이 비어 있거나 JSON 형식이 아닐 때 Unexpected end of JSON input 대신 파일별 원인을 표시\n- 한 파일의 응답 오류가 나머지 업로드 대기열 전체를 중단하지 않도록 개선',
  'system@evidence-lab',
  1786506500000,
  1786506500000
);
