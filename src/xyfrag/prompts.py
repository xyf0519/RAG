"""Prompt builders for query rewrite and grounded answer generation."""

from __future__ import annotations

from xyfrag.schemas import ChatMessage, RetrievedDocument


GROUNDING_SYSTEM_PROMPT = """你是校园资料库问答助手。
你必须且只能利用用户提供的参考资料回答问题。
如果参考资料中没有答案，直接说明“资料库中未找到相关规定”，不要编造。
每个事实性句子末尾必须标注对应来源编号，例如[1]或[1][2]。
不要引用未出现在参考资料中的信息。"""

REWRITE_SYSTEM_PROMPT = """你负责把多轮对话中的最新问题改写为一个独立检索问题。
仅输出改写后的问题，不要解释。
保留课程代码、机构缩写、日期、表单名称等关键词。"""


def build_reference_block(documents: list[RetrievedDocument]) -> str:
    """Build the numbered reference block used by the answer prompt.

    Args:
        documents: Reranked documents.

    Returns:
        Numbered reference text.
    """

    blocks = []
    for document in documents:
        blocks.append(
            f"[参考资料 {document.source_index}]\n"
            f"标题：{document.chunk.title}\n"
            f"Doc ID：{document.chunk.doc_id}\n"
            f"Chunk ID：{document.chunk.chunk_id}\n"
            f"内容：{document.chunk.text}"
        )
    return "\n\n".join(blocks)


def build_answer_messages(
    query: str,
    documents: list[RetrievedDocument],
) -> list[dict[str, str]]:
    """Build OpenAI-compatible chat messages for grounded answering.

    Args:
        query: User's current question.
        documents: Reranked reference documents.

    Returns:
        Chat messages for the LLM.
    """

    reference_block = build_reference_block(documents)
    user_content = f"参考资料：\n{reference_block}\n\n用户问题：{query}"
    return [
        {"role": "system", "content": GROUNDING_SYSTEM_PROMPT},
        {"role": "user", "content": user_content},
    ]


def build_rewrite_messages(
    history: list[ChatMessage],
    query: str,
) -> list[dict[str, str]]:
    """Build OpenAI-compatible messages for independent query rewrite.

    Args:
        history: Previous conversation messages.
        query: Latest user question.

    Returns:
        Chat messages for the LLM rewrite call.
    """

    history_lines = [
        f"{'用户' if message.role == 'user' else '助手'}：{message.content}"
        for message in history[-8:]
    ]
    history_text = "\n".join(history_lines) if history_lines else "无"
    user_content = f"历史对话：\n{history_text}\n\n最新问题：{query}"
    return [
        {"role": "system", "content": REWRITE_SYSTEM_PROMPT},
        {"role": "user", "content": user_content},
    ]
