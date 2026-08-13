INSERT INTO `notices` (`id`, `type`, `title`, `version`, `content`, `author_email`, `published_at`, `created_at`) VALUES (
  'patch-v1-0-24-cost-efficient-rag-routing',
  'patch',
  '질의응답 모델 비용 최적화',
  'v1.0.24',
  '- 논문 전문 사전분석은 정확도와 구조화 품질을 위해 GPT-5 mini 유지\n- 일반 RAG 질의응답을 비용 효율적인 GPT-5.6 Luna로 전환\n- 논문 비교, 비판적 검토, 상세 수치, 방법론 질문은 GPT-5 mini로 자동 전환\n- Luna 요청을 사용할 수 없는 경우 GPT-5 mini로 안전하게 재시도\n- 채팅 답변에 실제 사용된 모델을 표시해 비용 경로 확인 가능',
  'system@evidence-lab',
  1786604100000,
  1786604100000
);
