"""Traduções: deteção da língua da fonte e o critério de distância à fonte
(mais rigoroso quando a tradução está na mesma língua que ela)."""

from app.services.originality import OriginalityReport
from app.services.translate import detect_language, too_close

EN = (
    "Erling Haaland scored twice as Norway beat Denmark 3-2 in the Nations League on Thursday. "
    "The Manchester City striker has now scored in each of his last five games for his country, "
    "and he was at the heart of everything good that Norway did in the second half at the stadium."
)
ES = (
    "Erling Haaland marcó dos goles y Noruega venció a Dinamarca por 3-2 en la Liga de Naciones. "
    "El delantero del Manchester City ha marcado en los cinco últimos partidos con su selección, "
    "y fue el centro de todo lo bueno que hizo Noruega en la segunda parte del partido en el estadio."
)
PT = (
    "Erling Haaland marcou dois golos e a Noruega venceu a Dinamarca por 3-2 na Liga das Nações. "
    "O avançado do Manchester City marcou nos cinco últimos jogos pela seleção, e esteve no centro "
    "de tudo o que a Noruega fez de bom na segunda parte do jogo no estádio da cidade."
)


def test_detect_language():
    assert detect_language(EN) == "en"
    assert detect_language(ES) == "es"
    assert detect_language(PT) == "pt"
    assert detect_language("curto demais") is None


def report(*reasons: str) -> OriginalityReport:
    return OriginalityReport(reasons=list(reasons))


def test_other_language_only_blocks_on_block():
    assert too_close(report("longest_common_run=review", "title_overlap=block"), same_lang=False) == []
    assert too_close(report("containment_5=block"), same_lang=False) == ["containment_5=block"]


def test_same_language_fails_on_any_review_including_title():
    r = report("longest_common_run=review", "title_overlap=review", "word_count=review")
    assert too_close(r, same_lang=True) == ["longest_common_run=review", "title_overlap=review"]
    assert too_close(report("word_count=block"), same_lang=True) == []
