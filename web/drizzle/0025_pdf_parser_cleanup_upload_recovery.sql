INSERT INTO `notices` (`id`, `type`, `title`, `version`, `content`, `author_email`, `published_at`, `created_at`) VALUES (
  'patch-v1-0-18-pdf-parser-cleanup-upload-recovery',
  'patch',
  'PDF 파서 오류로 인한 업로드 실패 수정',
  'v1.0.18',
  '- 일부 학술 PDF의 특수 글꼴을 처리한 뒤 파서 종료 과정에서 발생하던 서버 오류 수정\n- 서지정보 추출이나 파서 정리 실패가 원본 PDF 저장을 취소하지 않도록 업로드 단계 분리\n- 대용량 PDF는 바이너리 전체를 문자열로 변환하지 않고 앞뒤 구간만 DOI 보조 탐색에 사용해 메모리 사용량 절감\n- 라이브러리 기록 실패 시 저장된 원본을 안전하게 되돌리고 모든 서버 오류를 JSON으로 안내',
  'system@evidence-lab',
  1786508000000,
  1786508000000
);
