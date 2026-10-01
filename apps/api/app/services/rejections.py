"""
Motivo legível de uma notícia recusada ou falhada (topics.rejection_category /
rejection_reason) — mostrado em Tendências, com "Pedir revisão" e "Rever todas
com este motivo".

Sem chamadas à IA (zero custo): quando foi a IA a recusar (a redação, nos
passos 1–2 — exceção TopicRejected), a explicação é a que ela própria
escreveu; nos outros casos (verificações do sistema, erros técnicos) traduz-se
o erro para português claro.
"""

from __future__ import annotations

CATEGORY_LABELS: dict[str, str] = {
    "pontuacao": "Pontuação baixa",
    "nao_futebol": "Não é futebol",
    "sem_conteudo": "Fonte sem conteúdo",
    "inviavel": "Recusada pela redação",
    "duplicado": "Duplicada",
    "ia_sem_saldo": "IA sem saldo/quota",
    "resposta_cortada": "Resposta da IA cortada",
    "fonte_inacessivel": "Fonte inacessível",
    "originalidade": "Demasiado parecida com a fonte",
    "auditoria": "Chumbada na auditoria",
    "estrutura": "Estrutura/comprimento",
    "erro_tecnico": "Erro técnico",
}

# razões do portão de originalidade (originality.py) em português
_ORIGINALITY_TEXT = {
    "longest_common_run": "tem sequências de palavras iguais às da fonte",
    "containment_5": "uma parte grande do texto aparece na fonte",
    "jaccard_5": "o texto é globalmente parecido com a fonte",
    "sentence_overlap": "várias frases têm trechos da fonte",
    "title_overlap": "o título é parecido com o da fonte",
    "self_similarity": "é parecido com um artigo nosso recente",
    "word_count": "ficou curto demais",
    "structure": "faltam secções obrigatórias",
    "unauthorized_quotes": "tem citações que não estão na ficha de factos",
}


def _originality_explained(error: str) -> str:
    found = [text for key, text in _ORIGINALITY_TEXT.items() if f"{key}=block" in error]
    return "; ".join(found) if found else "o artigo ficou demasiado parecido com a fonte"


def from_editor(reason: str) -> tuple[str, str]:
    """A redação (IA) recusou o assunto — TopicRejected nos passos 1–2 ou duplicado."""
    low = reason.lower()
    if "já existe um artigo" in low:
        return "duplicado", "Já existe um artigo para esta notícia (a mesma fonte já foi usada)."
    if "sem substância" in low:
        return "sem_conteudo", f"A fonte não tem informação suficiente para um artigo ({reason.split(':', 1)[-1].strip()})."
    if "futebol" in low and any(w in low for w in ("não ", "nenhuma", "sem ligação", "não tem", "críquete", "dardos")):
        return "nao_futebol", reason
    return "inviavel", reason


def from_error(error: str) -> tuple[str, str]:
    """Falha terminal da geração (status 'failed')."""
    low = error.lower()
    if any(k in low for k in ("quota", "credits", "credit", "billing", "saldo")) or "http 429" in low:
        return "ia_sem_saldo", (
            "O provedor de IA recusou o pedido por falta de saldo ou quota. Carrega créditos ou muda de provedor "
            "em Configuração → Provedores de IA e depois pede revisão."
        )
    if "cortada" in low:
        return "resposta_cortada", (
            "A resposta da IA foi cortada antes do fim (o modelo gastou o limite de tokens a raciocinar). "
            "Baixa o “esforço” do modelo ou aumenta os “tokens extra” do provedor."
        )
    if "descarregar" in low or "extrair texto" in low or "inacessível" in low:
        return "fonte_inacessivel", "Não foi possível ler o artigo original (o site bloqueou o pedido ou a página mudou)."
    if "estrutura/comprimento" in low:
        return "estrutura", "O artigo saiu sem as secções obrigatórias ou curto demais, e não dava para corrigir só com reescrita."
    if "originalidade" in low:
        return "originalidade", f"Mesmo depois de reescrito, {_originality_explained(error)}."
    if "auditoria" in low:
        detail = error.split(":", 1)[-1].strip()
        return "auditoria", f"A auditoria encontrou cópia ou factos inventados graves, mesmo depois da reescrita: {detail}"
    if "processo reiniciado" in low or "preso em 'processing'" in low:
        return "erro_tecnico", "O backend reiniciou a meio da geração."
    return "erro_tecnico", f"Erro técnico: {error[:300]}"


def from_score(score: float, min_score: float, keywords: list[str], relevance: float) -> tuple[str, str]:
    if keywords and relevance <= 0.1:
        return "pontuacao", (
            f"Pontuação {score:.2f}, abaixo do mínimo {min_score:.2f}: o título não tem nenhuma das palavras-chave "
            f"desta fonte ({', '.join(keywords[:6])}{'…' if len(keywords) > 6 else ''})."
        )
    return "pontuacao", f"Pontuação {score:.2f}, abaixo do mínimo {min_score:.2f} (Configuração → Motor editorial)."
