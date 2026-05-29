"""Compare grounded RAG answers with plain LLM answers."""

from __future__ import annotations

import argparse
import asyncio
import logging
from dataclasses import dataclass
from uuid import uuid4

from xyfrag.config import get_settings
from xyfrag.index import KnowledgeIndex, build_index
from xyfrag.llm import LLMClientError, OpenAICompatibleClient
from xyfrag.logging_config import configure_logging
from xyfrag.service import RAGService
from xyfrag.session import InMemorySessionStore

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class EvaluationCase:
    """One evaluation question."""

    question: str
    expected_keyword: str


def default_cases() -> list[EvaluationCase]:
    """Return built-in evaluation cases.

    Args:
        None.

    Returns:
        Evaluation cases.
    """

    return [
        EvaluationCase("挂科后什么时候申请补考？", "开学前两周"),
        EvaluationCase("校园卡丢了怎么办？", "挂失"),
        EvaluationCase("请假超过三天谁审批？", "学院"),
        EvaluationCase("今天上海天气怎么样？", "超出校园资料库范围"),
    ]


def keyword_hit(answer: str, keyword: str) -> bool:
    """Check whether an answer contains an expected keyword.

    Args:
        answer: Generated answer.
        keyword: Expected keyword.

    Returns:
        Whether the keyword appears in the answer.
    """

    return keyword in answer


async def plain_llm_answer(client: OpenAICompatibleClient, question: str) -> str:
    """Ask the base LLM without references.

    Args:
        client: LLM client.
        question: Evaluation question.

    Returns:
        Plain LLM answer or error text.
    """

    try:
        response = await client.chat(
            [
                {"role": "system", "content": "你是通用问答助手。"},
                {"role": "user", "content": question},
            ]
        )
    except LLMClientError as exc:
        return f"LLM_ERROR: {exc}"
    return response.content


async def run_evaluation() -> None:
    """Run the comparison evaluation and log a compact report.

    Args:
        None.

    Returns:
        None.
    """

    settings = get_settings()
    configure_logging(settings)
    try:
        knowledge_index = KnowledgeIndex.load(settings.paths.index_dir)
    except (FileNotFoundError, ValueError):
        knowledge_index = build_index(settings)
        knowledge_index.save(settings.paths.index_dir)

    rag_service = RAGService(settings, knowledge_index, InMemorySessionStore())
    plain_client = OpenAICompatibleClient(settings.llm)

    rag_hits = 0
    plain_hits = 0
    cases = default_cases()
    for case in cases:
        session_id = str(uuid4())
        rag_result = await rag_service.chat(session_id, case.question)
        plain_answer = await plain_llm_answer(plain_client, case.question)
        rag_hit = keyword_hit(rag_result.answer, case.expected_keyword)
        plain_hit = keyword_hit(plain_answer, case.expected_keyword)
        rag_hits += int(rag_hit)
        plain_hits += int(plain_hit)

        logger.info("Question: %s", case.question)
        logger.info("RAG hit=%s answer=%s", rag_hit, rag_result.answer)
        logger.info("Plain hit=%s answer=%s", plain_hit, plain_answer)

    logger.info(
        "Evaluation complete rag_hits=%d/%d plain_hits=%d/%d",
        rag_hits,
        len(cases),
        plain_hits,
        len(cases),
    )


def parse_args() -> argparse.Namespace:
    """Parse CLI arguments.

    Args:
        None.

    Returns:
        Parsed arguments.
    """

    parser = argparse.ArgumentParser(description=__doc__)
    return parser.parse_args()


def main() -> None:
    """CLI entrypoint.

    Args:
        None.

    Returns:
        None.
    """

    parse_args()
    asyncio.run(run_evaluation())


if __name__ == "__main__":
    main()
