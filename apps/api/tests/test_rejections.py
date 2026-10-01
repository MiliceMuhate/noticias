"""Motivo legível das notícias recusadas/falhadas (services/rejections.py), a partir
de mensagens reais vistas em produção."""

from app.services.rejections import from_editor, from_error, from_score


def test_quota_and_credit_errors_are_ia_sem_saldo():
    gemini = "Google Gemini / gemini-3.8-flash: quota do provedor esgotada (HTTP 429). Detalhe: {...}"
    openai = 'OpenAI / gpt-6-luna: HTTP 429 — {"error": {"message": "You have no credits remaining."}}'
    assert from_error(gemini)[0] == "ia_sem_saldo"
    assert from_error(openai)[0] == "ia_sem_saldo"


def test_other_failures_map_to_their_category():
    assert from_error("não foi possível descarregar o artigo (HTTP 403): https://espn.com/x")[0] == "fonte_inacessivel"
    assert from_error("anthropic-env / claude-sonnet-5: resposta cortada — atingiu o limite de 2048 tokens.")[0] == "resposta_cortada"
    cat, why = from_error("bloqueado pelo portão de originalidade após reescrita: ['longest_common_run=block', 'title_overlap=review']")
    assert cat == "originalidade" and "sequências de palavras iguais" in why
    assert from_error("bloqueado pela auditoria após reescrita: cópia substancial")[0] == "auditoria"
    assert from_error("bloqueado por estrutura/comprimento, não por semelhança com a fonte: [...]")[0] == "estrutura"
    assert from_error("KeyError: 'x'")[0] == "erro_tecnico"


def test_editor_rejections_keep_the_ai_explanation():
    reason = "O tema não tem qualquer ligação ao futebol ou ao desporto. É uma notícia de política monetária."
    assert from_editor(reason) == ("nao_futebol", reason)
    assert from_editor("fonte sem substância: 4 factos, densidade=baixa")[0] == "sem_conteudo"
    assert from_editor("já existe um artigo para esta fonte: https://x")[0] == "duplicado"
    inviavel = "A ficha não contém o desfecho do jogo (a eliminatória está a meio)."
    assert from_editor(inviavel) == ("inviavel", inviavel)


def test_score_rejection_names_the_missing_keywords():
    cat, why = from_score(0.465, 0.5, ["futebol", "moçambola"], relevance=0.1)
    assert cat == "pontuacao" and "moçambola" in why and "0.47" in why
    assert "palavras-chave" not in from_score(0.4, 0.45, [], relevance=0.5)[1]
