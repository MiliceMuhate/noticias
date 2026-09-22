class TopicRejected(RuntimeError):
    """
    Um dos portões editoriais decidiu que este topic não dá artigo — não é uma
    falha técnica a repetir (ver docs/publicador/PROMPTS.md, portas de P1/P2).
    scheduler.py apanha isto separadamente e marca o topic 'rejected', não 'failed'.
    """
