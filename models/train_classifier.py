"""Train the boundary classifier for knowledge-base scope detection."""

from __future__ import annotations

import argparse
import logging
from pathlib import Path

import joblib
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics import classification_report
from sklearn.neural_network import MLPClassifier
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline

from xyfrag.config import get_settings
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
        "校园卡丢失后如何挂失",
        "图书馆借书最多可以借几本",
        "研究生奖学金评定规则",
        "教务处办公时间",
        "如何办理学生证补办",
        "宿舍报修流程是什么",
        "课程代码 CS101 的考试安排",
        "退课截止日期是什么时候",
        "本科生转专业需要满足什么条件",
        "校医院医保报销材料有哪些",
        "毕业论文提交系统怎么使用",
        "创新创业学分如何认定",
        "实验室安全考试在哪里参加",
        "校园网账号密码忘记怎么办",
        "入党积极分子培训报名方式",
        "成绩复核申请表在哪里下载",
        "学生请假超过三天需要谁审批",
        "寒暑假留校住宿申请流程",
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
        "如何训练马拉松",
        "帮我起一个网名",
        "外星生命存在吗",
        "介绍一下咖啡豆烘焙",
        "我今天心情不好怎么办",
    ]

    texts = in_scope_samples + out_of_scope_samples
    labels = [1] * len(in_scope_samples) + [0] * len(out_of_scope_samples)
    return texts, labels


def train_classifier(output_dir: Path) -> Path:
    """Train and save the boundary classifier.

    Args:
        output_dir: Directory where the classifier artifact will be saved.

    Returns:
        Path to the saved classifier artifact.

    Raises:
        OSError: If the output directory cannot be created or written.
    """

    texts, labels = build_mock_dataset()
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
    train_classifier(output_dir)


if __name__ == "__main__":
    main()
