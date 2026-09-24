"""
Scheduler interno (substitui pg_cron→Edge Function e o poll de filas do worker
Node — ver docs/ARCHITECTURE.md). Dois ciclos:

- sync_trends: descobre artigos novos (fontes RSS ativas) + pontua os que ficaram 'detected'.
- generate_pending: gera a reescrita para topics em 'approved_for_gen'.
"""

from __future__ import annotations

import datetime
from collections.abc import Awaitable, Callable
from typing import Any

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from .config import settings
from .db import supabase
from .exceptions import TopicRejected
from .llm import UsageTracker
from .log import log, log_error
from .pricing import estimate_cost_usd
from .services.articles import generate_article
from .services.news_sources import news_source_for
from .services.scoring import score_topic

scheduler = AsyncIOScheduler()


def _settings_map(keys: list[str]) -> dict[str, Any]:
    res = supabase.table("settings").select("*").in_("key", keys).execute()
    return {row["key"]: row["value"] for row in (res.data or [])}


async def sync_trends() -> None:
    await discover_articles()
    await score_detected_topics()


async def discover_articles() -> None:
    sources_res = supabase.table("sources").select("*").eq("enabled", True).execute()
    for source in sources_res.data or []:
        try:
            provider = news_source_for(source["kind"])
            articles = await provider.discover(source.get("config") or {})
            inserted = 0
            for a in articles:
                try:
                    supabase.table("topics").insert(
                        {
                            "source_id": source["id"],
                            "term": a.term,
                            "region": a.region,
                            "category": a.category,
                            "momentum": a.momentum,
                            "status": "detected",
                            "raw_data": a.raw,
                        }
                    ).execute()
                    inserted += 1
                except Exception as err:  # 23505 = duplicado do mesmo dia -- ignora
                    if "23505" not in str(err):
                        log_error("discover_articles", f"falha a inserir topic de {source['id']}", err)
            log("discover_articles", f"fonte {source['kind']}: {len(articles)} encontrados, {inserted} novos")
        except Exception as err:
            log_error("discover_articles", f"fonte {source['id']} falhou", err)


async def score_detected_topics() -> None:
    cfg = _settings_map(["scoring_weights", "score_threshold", "auto_approve_gen"])
    weights = cfg.get("scoring_weights") or {"relevance": 0.4, "momentum": 0.35, "volume": 0.25}
    min_score = (cfg.get("score_threshold") or {}).get("min_score", 0.45)
    auto_approve = cfg.get("auto_approve_gen") or {"enabled": False, "auto_threshold": 1}

    topics_res = (
        supabase.table("topics").select("*, sources(config)").eq("status", "detected").limit(100).execute()
    )
    scored = 0
    for topic in topics_res.data or []:
        keywords = ((topic.get("sources") or {}).get("config") or {}).get("keywords") or []
        score = score_topic(
            term=topic["term"],
            category=topic.get("category"),
            momentum=topic.get("momentum"),
            raw_data=topic.get("raw_data"),
            keywords=keywords,
            weights=weights,
        )
        status = "scored" if score >= min_score else "rejected"
        if status == "scored" and auto_approve.get("enabled") and score >= auto_approve.get("auto_threshold", 1):
            status = "approved_for_gen"

        supabase.table("topics").update(
            {"score": score, "status": status, "momentum": topic.get("momentum") or "rising"}
        ).eq("id", topic["id"]).execute()
        scored += 1

    if scored:
        log("score_topics", f"{scored} topics pontuados")


async def generate_pending(limit: int = 5, after_each: Callable[[], Awaitable[None]] | None = None) -> None:
    """
    `after_each`, quando passado, corre logo a seguir a CADA topic (sucesso ou
    falha) -- é como o piloto automático (autopilot_tick) publica cada peça
    assim que fica pronta, em vez de esperar o lote inteiro (ver
    auto_publish_ready). Sem `after_each` (ciclo normal, botão manual
    "Gerar agora"), o comportamento é exatamente o de antes.
    """
    await recover_stuck_topics()

    topics_res = (
        supabase.table("topics")
        .select("id, term, region, raw_data")
        .eq("status", "approved_for_gen")
        .limit(limit)
        .execute()
    )
    for topic in topics_res.data or []:
        await _generate_one(topic)
        if after_each:
            try:
                await after_each()
            except Exception as err:
                # nunca deixar uma falha aqui travar os topics seguintes do lote
                log_error("generate_pending", "after_each falhou (tenta de novo no próximo ciclo)", err)


async def recover_stuck_topics() -> None:
    """
    Um topic fica 'processing' assim que uma geração arranca (lock otimista).
    Se o backend reiniciar/crashar a meio, esse topic fica órfão em 'processing'
    para sempre — ninguém mais volta a olhar para ele. Isto apanha esses casos
    (parado há mais que `stale_processing_minutes`) e marca-os 'failed', para
    aparecerem no painel com o botão "Tentar novamente".
    """
    cutoff = (
        datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(minutes=settings.stale_processing_minutes)
    ).isoformat()
    stuck_res = (
        supabase.table("topics")
        .select("id, term")
        .eq("status", "processing")
        .lt("updated_at", cutoff)
        .execute()
    )
    for topic in stuck_res.data or []:
        reason = (
            f"processo reiniciado (ou crash) a meio da geração — ficou preso em "
            f"'processing' há mais de {settings.stale_processing_minutes}min sem terminar"
        )
        supabase.table("topics").update({"status": "failed"}).eq("id", topic["id"]).execute()
        # sem isto, o job desta tentativa ficava 'running' para sempre, sem
        # `error` nenhum — o painel mostrava o topic como falhado mas sem
        # nenhum erro técnico associado a explicar porquê.
        supabase.table("jobs").update({"status": "failed", "error": reason}).eq("topic_id", topic["id"]).eq(
            "status", "running"
        ).execute()
        log_error(
            "recover_stuck_topics",
            f'topic "{topic["term"]}" ({topic["id"]}) preso em processing há mais de '
            f"{settings.stale_processing_minutes}min — marcado failed (provável reinício do backend a meio)",
        )


async def _generate_one(topic: dict[str, Any]) -> None:
    topic_id = topic["id"]
    # reclamação atómica (compare-and-swap): só continua se este processo foi
    # mesmo quem mudou o estado de 'approved_for_gen' para 'processing'. Sem
    # o `.eq("status", ...)` aqui, duas chamadas concorrentes (o ciclo normal
    # generate_pending a cada 2min e o autopilot_tick a cada 20s chamam a
    # mesma função) liam o mesmo topic 'approved_for_gen' e geravam CADA UMA o
    # seu próprio artigo para a mesma notícia — daí duplicados reais na fila
    # e custo de LLM a dobrar. Se outro processo já reclamou este topic
    # entretanto, a atualização afeta 0 linhas e paramos aqui, sem custo nenhum.
    claim = (
        supabase.table("topics")
        .update({"status": "processing"})
        .eq("id", topic_id)
        .eq("status", "approved_for_gen")
        .execute()
    )
    if not claim.data:
        return

    prior = (
        supabase.table("jobs")
        .select("id", count="exact")
        .eq("topic_id", topic_id)
        .eq("type", "generate-article")
        .execute()
    )
    attempt_no = (prior.count or 0) + 1

    job_res = (
        supabase.table("jobs")
        .insert(
            {
                "type": "generate-article",
                "topic_id": topic_id,
                "payload": {"term": topic["term"]},
                "status": "running",
                "attempts": attempt_no,
            }
        )
        .execute()
    )
    job_id = job_res.data[0]["id"] if job_res.data else None

    # criado aqui (não dentro de generate_article) para que os tokens já gastos
    # fiquem registados mesmo que a geração falhe a meio — cada chamada ao LLM
    # custa dinheiro independentemente do resultado final.
    tracker = UsageTracker()

    try:
        item_id = await generate_article(topic, tracker)
        cost_usd = estimate_cost_usd(settings.anthropic_model, tracker.input_tokens, tracker.output_tokens)
        if job_id:
            supabase.table("jobs").update(
                {
                    "status": "done",
                    "input_tokens": tracker.input_tokens,
                    "output_tokens": tracker.output_tokens,
                    "cost_usd": cost_usd,
                }
            ).eq("id", job_id).execute()
        # estado terminal de sucesso — sem isto o topic ficava preso em 'processing'
        # e o painel não tinha como mostrar que a geração tinha terminado.
        supabase.table("topics").update({"status": "generated"}).eq("id", topic_id).execute()
        log("generate_pending", f'topic "{topic["term"]}" -> content_item {item_id} (pending_review, ${cost_usd:.4f})')
    except TopicRejected as reason:
        # portão editorial (P1/P2, docs/publicador/PROMPTS.md): não é uma falha a
        # repetir, é a redação a decidir que este assunto não dá artigo. Vai direto
        # a 'rejected', nunca conta para MAX_GENERATE_ATTEMPTS.
        cost_usd = estimate_cost_usd(settings.anthropic_model, tracker.input_tokens, tracker.output_tokens)
        if job_id:
            supabase.table("jobs").update(
                {
                    "status": "done",
                    "error": str(reason),
                    "input_tokens": tracker.input_tokens,
                    "output_tokens": tracker.output_tokens,
                    "cost_usd": cost_usd,
                }
            ).eq("id", job_id).execute()
        supabase.table("topics").update({"status": "rejected"}).eq("id", topic_id).execute()
        log("generate_pending", f'topic "{topic["term"]}" rejeitado pela redação: {reason}')
    except Exception as err:
        log_error("generate_pending", f'topic "{topic["term"]}" falhou (tentativa {attempt_no})', err)
        cost_usd = estimate_cost_usd(settings.anthropic_model, tracker.input_tokens, tracker.output_tokens)
        if job_id:
            supabase.table("jobs").update(
                {
                    "status": "failed",
                    "error": str(err),
                    "input_tokens": tracker.input_tokens,
                    "output_tokens": tracker.output_tokens,
                    "cost_usd": cost_usd,
                }
            ).eq("id", job_id).execute()
        if attempt_no < settings.max_generate_attempts:
            # devolve à fila para tentar de novo no próximo ciclo
            supabase.table("topics").update({"status": "approved_for_gen"}).eq("id", topic_id).execute()
        else:
            # esgotou as tentativas automáticas — estado terminal visível no
            # painel, com o erro à mão e um botão para o operador tentar de novo
            supabase.table("topics").update({"status": "failed"}).eq("id", topic_id).execute()


AUTOPILOT_KEY = "autopilot"


async def _autopilot_enabled() -> bool:
    cfg = _settings_map([AUTOPILOT_KEY])
    return bool((cfg.get(AUTOPILOT_KEY) or {}).get("enabled"))


async def autopilot_tick() -> None:
    """
    Ciclo do botão "piloto automático" (apps/web Automacao.tsx): enquanto
    settings.autopilot.enabled=true, deteta + gera + publica sozinho, sem
    esperar pelos ciclos normais acima nem por um clique por artigo. Cada fase
    é isolada: uma falha numa não trava as outras nem o próximo ciclo — isto
    corre indefinidamente até o operador desligar.

    Grava sempre `last_tick_at`/`last_error` em settings.autopilot — sem isto,
    "o piloto não fez nada" era indistinguível de "o backend nem está a
    correr" a partir do painel (só dava para ver nos logs do processo).

    generate_pending recebe auto_publish_ready como `after_each`: cada peça
    fica disponível para publicação assim que ELA PRÓPRIA termina, não só no
    fim do lote inteiro — com lotes de até `autopilot_generate_batch` (25)
    topics, cada um com 6 chamadas ao LLM, esperar pelo lote todo podia levar
    dezenas de minutos antes de a primeira peça pronta chegar a publicar.
    """
    if not await _autopilot_enabled():
        return
    errors: list[str] = []
    try:
        await sync_trends()
    except Exception as err:
        log_error("autopilot", "sync_trends falhou neste ciclo", err)
        errors.append(f"sync_trends: {err}")
    try:
        await generate_pending(limit=settings.autopilot_generate_batch, after_each=auto_publish_ready)
    except Exception as err:
        log_error("autopilot", "generate_pending falhou neste ciclo", err)
        errors.append(f"generate_pending: {err}")
    try:
        # cobre o caso de o lote ter ficado vazio (nada novo para gerar) mas
        # ainda assim haver algo em pending_review de um ciclo anterior à
        # espera (ex.: tinha batido no limite diário e agora já pode publicar)
        await auto_publish_ready()
    except Exception as err:
        log_error("autopilot", "auto_publish_ready falhou neste ciclo", err)
        errors.append(f"auto_publish_ready: {err}")

    cfg = _settings_map([AUTOPILOT_KEY]).get(AUTOPILOT_KEY) or {}
    supabase.table("settings").update(
        {
            "value": {
                **cfg,
                "last_tick_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                "last_error": " | ".join(errors) if errors else None,
            }
        }
    ).eq("key", AUTOPILOT_KEY).execute()


def _is_autopublish_ready(meta: dict[str, Any]) -> bool:
    """
    Só publica sozinho o que o motor editorial (docs/publicador) já validou sem
    reservas: portão de originalidade 'pass' (nunca 'review' — isso é sempre
    para olhos humanos) e, quando a auditoria correu, veredicto 'aprovado'.
    """
    originality = meta.get("originality") or {}
    if originality.get("verdict") != "pass":
        return False
    audit = meta.get("self_audit")
    if audit and audit.get("veredicto") != "aprovado":
        return False
    return True


async def auto_publish_ready() -> None:
    """
    Publica sozinho os content_items 'pending_review' prontos (ver
    _is_autopublish_ready) — substitui o clique "Aprovar e publicar" por artigo
    quando o piloto automático está ligado (a decisão humana passa a ser ligar
    o interruptor, não cada aprovação — ver docs/publicador/EDITORIAL.md §9).

    Continua a respeitar max_published_per_day, imposto pela BD
    (enforce_review_gate) -- ao ser atingido, o UPDATE seguinte simplesmente
    falha e este ciclo para, tentando de novo no próximo tick.
    max_per_source_per_day e require_manual_edit_every_n não têm equivalente na
    BD (ver TASKS.md) e são verificados aqui: o primeiro por contagem, o
    segundo reservando 1 em cada N artigos prontos para revisão manual em vez
    de os publicar sozinho. (Existiu também min_minutes_between_publications —
    removido a pedido do operador, não interessava espaçar publicações no
    tempo.)
    """
    cfg = _settings_map(["publishing_limits", AUTOPILOT_KEY])
    limits = cfg.get("publishing_limits") or {}
    autopilot_cfg = cfg.get(AUTOPILOT_KEY) or {}
    streak = int(autopilot_cfg.get("auto_published_streak") or 0)
    require_manual_every_n = limits.get("require_manual_edit_every_n") or 0
    max_per_source = limits.get("max_per_source_per_day")

    items_res = (
        supabase.table("content_items")
        .select("id, metadata")
        .eq("status", "pending_review")
        .order("created_at")
        .execute()
    )
    candidates = [item for item in (items_res.data or []) if _is_autopublish_ready(item.get("metadata") or {})]
    if not candidates:
        return

    published_today_by_source: dict[str, int] = {}
    if max_per_source:
        cutoff = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=24)).isoformat()
        today_res = (
            supabase.table("content_items").select("metadata").eq("status", "published").gt("published_at", cutoff).execute()
        )
        for row in today_res.data or []:
            src = (row.get("metadata") or {}).get("source_name") or "?"
            published_today_by_source[src] = published_today_by_source.get(src, 0) + 1

    published_count = 0
    for item in candidates:
        meta = item.get("metadata") or {}
        source_name = meta.get("source_name") or "?"

        if require_manual_every_n and streak >= require_manual_every_n:
            log("autopilot", f'content_item {item["id"]} reservado para revisão manual (ritmo de {require_manual_every_n})')
            streak = 0
            continue

        if max_per_source and published_today_by_source.get(source_name, 0) >= max_per_source:
            log("autopilot", f'content_item {item["id"]} adiado: limite diário da fonte "{source_name}" atingido')
            continue

        try:
            supabase.table("content_items").update({"status": "published"}).eq("id", item["id"]).execute()
        except Exception as err:
            if "REVIEW GATE" in str(err):
                log("autopilot", f"ritmo de publicação ainda não permite mais nesta ronda: {err}")
                break
            log_error("autopilot", f'falha a publicar automaticamente {item["id"]}', err)
            continue

        streak += 1
        published_count += 1
        published_today_by_source[source_name] = published_today_by_source.get(source_name, 0) + 1
        log("autopilot", f'content_item {item["id"]} publicado automaticamente (streak={streak})')

    supabase.table("settings").update({"value": {**autopilot_cfg, "auto_published_streak": streak}}).eq(
        "key", AUTOPILOT_KEY
    ).execute()

    if published_count:
        log("autopilot", f"{published_count} artigo(s) publicado(s) automaticamente")


def start() -> None:
    now = datetime.datetime.now()
    scheduler.add_job(sync_trends, "interval", minutes=settings.trends_sync_interval_min, id="sync_trends", next_run_time=now)
    scheduler.add_job(
        generate_pending, "interval", minutes=settings.generate_poll_interval_min, id="generate_pending", next_run_time=now
    )
    scheduler.add_job(
        autopilot_tick,
        "interval",
        seconds=settings.autopilot_tick_interval_sec,
        id="autopilot_tick",
        next_run_time=now,
    )
    scheduler.start()
    log(
        "scheduler",
        f"a arrancar -- sync_trends a cada {settings.trends_sync_interval_min}min, "
        f"generate_pending a cada {settings.generate_poll_interval_min}min, "
        f"autopilot_tick a cada {settings.autopilot_tick_interval_sec}s (só ativo com settings.autopilot.enabled)",
    )


def shutdown() -> None:
    scheduler.shutdown(wait=False)
