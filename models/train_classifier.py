"""Train the boundary classifier for knowledge-base scope detection."""

from __future__ import annotations

import argparse
import json
import logging
from pathlib import Path

import joblib
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics import classification_report
from sklearn.neural_network import MLPClassifier
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline

from xyfrag.config import PROJECT_ROOT, get_settings
from xyfrag.logging_config import configure_logging

logger = logging.getLogger(__name__)


def build_mock_dataset() -> tuple[list[str], list[int]]:
    """Build a small mock dataset for training the boundary classifier.

    Args:
        None.

    Returns:
        A tuple of text samples and binary labels. Label 1 means campus
        knowledge-base related, and label 0 means chitchat or out-of-scope.
    """

    in_scope_samples = [
        "怎么申请课程补考",
        "挂科后补考申请时间是什么时候",
        "成绩复核需要准备哪些材料",
        "选课分为哪几个阶段",
        "预选正选补退选有什么区别",
        "课程容量满了还能选吗",
        "先修课没通过可以选后续课程吗",
        "每学期选课学分上限是多少",
        "超学分选课怎么申请",
        "重修课程怎么选",
        "补退选结束后还能退课吗",
        "课表冲突系统允许选课吗",
        "两门课程考试时间冲突怎么办",
        "因病不能参加考试怎么申请缓考",
        "重修课可以申请免听吗",
        "平均学分绩点怎么算",
        "转专业后的课程怎么认定",
        "通识选修怎么满足模块要求",
        "毕业审核主要看哪些内容",
        "休学复学后怎么确认培养方案",
    ]
    out_of_scope_samples = [
        "今天天气怎么样",
        "给我讲个笑话",
        "帮我写一首爱情诗",
        "世界杯谁会夺冠",
        "推荐一部科幻电影",
        "股票明天会涨吗",
        "怎么做红烧肉",
        "你是谁",
        "量子纠缠的哲学意义",
        "帮我生成一张猫咪图片",
        "苹果手机哪款值得买",
        "北京旅游攻略",
        "写一个求职简历模板",
        "解释一下黑洞信息悖论",
        "最近有什么新闻",
        "校园卡丢了如何挂失",
        "宿舍报修流程是什么",
        "图书馆最多可以借几本书",
        "校园网账号密码忘记怎么办",
        "奖学金评定规则是什么",
        "食堂饭卡在哪里充值",
        "如何训练马拉松",
        "帮我起一个网名",
        "外星生命存在吗",
        "介绍一下咖啡豆烘焙",
        "我今天心情不好怎么办",
    ]

    texts = in_scope_samples + out_of_scope_samples
    labels = [1] * len(in_scope_samples) + [0] * len(out_of_scope_samples)
    return texts, labels


def load_jsonl_dataset(dataset_path: Path) -> tuple[list[str], list[int]]:
    """Load boundary classifier examples from JSONL.

    Each line must include `text` and `label`. Label `1` means in scope and
    label `0` means out of scope.

    Args:
        dataset_path: JSONL dataset path.

    Returns:
        Text and label lists.

    Raises:
        ValueError: If any row is malformed or too few examples are provided.
    """

    texts: list[str] = []
    labels: list[int] = []
    for line_number, line in enumerate(
        dataset_path.read_text(encoding="utf-8").splitlines(),
        start=1,
    ):
        if not line.strip():
            continue
        try:
            item = json.loads(line)
        except json.JSONDecodeError as exc:
            raise ValueError(f"Invalid JSON at {dataset_path}:{line_number}") from exc

        text = str(item.get("text", "")).strip()
        label = item.get("label")
        if not text or label not in {0, 1}:
            raise ValueError(
                f"Boundary row must contain text and label 0/1 at "
                f"{dataset_path}:{line_number}"
            )
        texts.append(text)
        labels.append(int(label))

    if len(texts) < 8 or len(set(labels)) < 2:
        raise ValueError("Boundary dataset needs at least 8 rows across both labels")

    return texts, labels


def train_classifier(output_dir: Path, dataset_path: Path | None = None) -> Path:
    """Train and save the boundary classifier.

    Args:
        output_dir: Directory where the classifier artifact will be saved.

    Returns:
        Path to the saved classifier artifact.

    Raises:
        OSError: If the output directory cannot be created or written.
    """

    if dataset_path and dataset_path.exists():
        texts, labels = load_jsonl_dataset(dataset_path)
        logger.info("Loaded boundary dataset from %s rows=%d", dataset_path, len(texts))
    else:
        texts, labels = build_mock_dataset()
        logger.warning(
            "Boundary dataset missing; using built-in mock data. "
            "Provide data/boundary/train.jsonl for production-like training."
        )
    train_texts, test_texts, train_labels, test_labels = train_test_split(
        texts,
        labels,
        test_size=0.25,
        random_state=42,
        stratify=labels,
    )

    pipeline: Pipeline = Pipeline(
        steps=[
            (
                "tfidf",
                TfidfVectorizer(
                    analyzer="char_wb",
                    ngram_range=(2, 4),
                    min_df=1,
                ),
            ),
            (
                "classifier",
                MLPClassifier(
                    hidden_layer_sizes=(32,),
                    solver="lbfgs",
                    max_iter=500,
                    random_state=42,
                ),
            ),
        ]
    )

    pipeline.fit(train_texts, train_labels)
    predictions = pipeline.predict(test_texts)
    logger.info(
        "Boundary classifier report:\n%s",
        classification_report(test_labels, predictions, digits=3, zero_division=0),
    )

    output_dir.mkdir(parents=True, exist_ok=True)
    artifact_path = output_dir / "classifier.joblib"
    joblib.dump(pipeline, artifact_path)
    logger.info("Saved boundary classifier to %s", artifact_path)
    return artifact_path


def parse_args() -> argparse.Namespace:
    """Parse CLI arguments.

    Args:
        None.

    Returns:
        Parsed command-line arguments.
    """

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--config",
        default="config/settings.yaml",
        help="Path to settings YAML.",
    )
    parser.add_argument(
        "--output-dir",
        default=None,
        help="Override model output directory.",
    )
    parser.add_argument(
        "--dataset",
        default="data/boundary/train.jsonl",
        help="Boundary training JSONL path. Falls back to mock data when missing.",
    )
    return parser.parse_args()


def main() -> None:
    """Train the boundary classifier from the command line.

    Args:
        None.

    Returns:
        None.
    """

    args = parse_args()
    settings = get_settings(args.config)
    configure_logging(settings)
    output_dir = Path(args.output_dir) if args.output_dir else settings.paths.classifier_dir
    dataset_path = Path(args.dataset)
    if not dataset_path.is_absolute():
        dataset_path = PROJECT_ROOT / dataset_path
    train_classifier(output_dir, dataset_path=dataset_path)


if __name__ == "__main__":
    main()
