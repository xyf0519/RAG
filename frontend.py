"""Gradio frontend for xyfRAG."""

from __future__ import annotations

import logging
from typing import Any
from uuid import uuid4

import gradio as gr
import httpx

from xyfrag.config import get_settings
from xyfrag.logging_config import configure_logging

logger = logging.getLogger(__name__)


def _format_sources(sources: list[dict[str, Any]]) -> str:
    """Format source citations for the Gradio side panel.

    Args:
        sources: Source payloads returned by the backend.

    Returns:
        Markdown source summary.
    """

    if not sources:
        return "暂无引用来源。"

    lines: list[str] = []
    for source in sources:
        lines.append(
            f"**[{source['index']}] {source['title']}**  \n"
            f"`{source['chunk_id']}` | score={source['score']:.3f}  \n"
            f"{source['text']}"
        )
    return "\n\n---\n\n".join(lines)


def _call_backend(message: str, session_id: str) -> tuple[str, str]:
    """Send a user message to the FastAPI backend.

    Args:
        message: Latest user message from Gradio.
        session_id: Current session ID.

    Returns:
        Assistant answer and formatted source markdown.
    """

    settings = get_settings()
    payload = {"query": message, "session_id": session_id}

    try:
        with httpx.Client(timeout=60.0) as client:
            response = client.post(f"{settings.frontend.backend_url}/chat", json=payload)
            response.raise_for_status()
    except httpx.RequestError as exc:
        logger.error("Backend request failed: %s", exc)
        return "后端服务连接失败，请确认 FastAPI 已启动。", "暂无引用来源。"
    except httpx.HTTPStatusError as exc:
        logger.error("Backend HTTP error: %s", exc)
        return "后端服务返回异常，请稍后重试。", "暂无引用来源。"

    data = response.json()
    if not data.get("ok", False) and data.get("error"):
        return str(data.get("answer", "")), f"错误：{data['error']}"

    metadata = (
        f"重写查询：`{data.get('rewritten_query', message)}`  \n"
        f"边界概率：`{data.get('boundary', {}).get('probability', 0.0):.3f}`  \n"
        f"是否调用大模型：`{data.get('used_llm', False)}`"
    )
    sources = _format_sources(data.get("sources", []))
    return str(data.get("answer", "")), f"{metadata}\n\n---\n\n{sources}"


def submit_message(
    message: str,
    history: list[dict[str, str]],
    session_id: str,
) -> tuple[list[dict[str, str]], str, str]:
    """Append a user message and backend answer to the chat.

    Args:
        message: User message.
        history: Current Gradio message history.
        session_id: Current session ID.

    Returns:
        Updated history, cleared input value, and source panel markdown.
    """

    if not message.strip():
        return history, "", "暂无引用来源。"

    answer, sources = _call_backend(message.strip(), session_id)
    updated_history = history + [
        {"role": "user", "content": message.strip()},
        {"role": "assistant", "content": answer},
    ]
    return updated_history, "", sources


def reset_session() -> tuple[str, list[dict[str, str]], str]:
    """Create a new frontend session.

    Args:
        None.

    Returns:
        New session ID, empty chat history, and empty source panel text.
    """

    return str(uuid4()), [], "暂无引用来源。"


def build_app() -> gr.Blocks:
    """Build the Gradio Blocks UI.

    Args:
        None.

    Returns:
        Gradio Blocks app.
    """

    settings = get_settings()
    configure_logging(settings)

    with gr.Blocks(title="xyfRAG") as demo:
        session_state = gr.State(str(uuid4()))
        gr.Markdown("# xyfRAG 校园资料库问答")
        with gr.Row():
            with gr.Column(scale=3):
                chatbot = gr.Chatbot(type="messages", height=520)
                chat_input = gr.Textbox(
                    placeholder="输入校园资料库相关问题...",
                    show_label=False,
                )
                with gr.Row():
                    submit = gr.Button("发送", variant="primary")
                    clear = gr.Button("新会话")
            with gr.Column(scale=2):
                source_panel = gr.Markdown("暂无引用来源。")

        submit.click(
            fn=submit_message,
            inputs=[chat_input, chatbot, session_state],
            outputs=[chatbot, chat_input, source_panel],
        )
        chat_input.submit(
            fn=submit_message,
            inputs=[chat_input, chatbot, session_state],
            outputs=[chatbot, chat_input, source_panel],
        )
        clear.click(
            fn=reset_session,
            inputs=[],
            outputs=[session_state, chatbot, source_panel],
        )

    return demo


if __name__ == "__main__":
    build_app().launch()
