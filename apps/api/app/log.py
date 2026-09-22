import datetime
import logging

logging.basicConfig(level=logging.INFO, format="%(message)s")
_logger = logging.getLogger("api")


def _ts() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def log(scope: str, message: str) -> None:
    _logger.info("[%s] [%s] %s", _ts(), scope, message)


def log_error(scope: str, message: str, err: object = None) -> None:
    _logger.error("[%s] [%s] ERRO: %s %s", _ts(), scope, message, err or "")
