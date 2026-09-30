"""O que o Hermes devolve é tratado como não confiável (services/hermes.py):
só domínios aprovados, fontes independentes suficientes, sem duplicados."""

from app.services.hermes import _allowed, build_config_yaml, parse_usage, validate_stories

CFG = {"allowed_domains": ["espn.com", "bbc.com", "record.pt"], "min_sources": 2, "max_stories": 5}


def story(url="https://www.espn.com/a", corro=None, **kw):
    return {
        "title": "Título",
        "primary_url": url,
        "primary_source": "ESPN",
        "summary": "Resumo.",
        "national": False,
        "corroborating": corro if corro is not None else [{"url": "https://www.bbc.com/sport/x", "source": "BBC", "confirms": ["3-1"]}],
        "discrepancies": [],
        **kw,
    }


def test_allowed_matches_domain_and_subdomains_only():
    assert _allowed("https://www.espn.com/x", CFG["allowed_domains"]) == "espn.com"
    assert _allowed("https://sport.bbc.com/x", CFG["allowed_domains"]) == "bbc.com"
    assert _allowed("https://espn.com.evil.io/x", CFG["allowed_domains"]) is None
    assert _allowed("https://notespn.com/x", CFG["allowed_domains"]) is None
    assert _allowed("javascript:alert(1)", CFG["allowed_domains"]) is None


def test_accepts_story_with_two_distinct_approved_domains():
    accepted, rejected = validate_stories({"stories": [story()]}, CFG, known=set())
    assert len(accepted) == 1 and rejected == []
    assert accepted[0]["corroborating"][0]["source"] == "BBC"


def test_rejects_primary_outside_allowlist():
    accepted, rejected = validate_stories({"stories": [story(url="https://random-blog.net/x")]}, CFG, known=set())
    assert accepted == [] and "fora da lista" in rejected[0]


def test_same_outlet_or_unapproved_corroboration_does_not_count():
    corro = [
        {"url": "https://espn.com/other", "source": "ESPN"},  # mesmo órgão
        {"url": "https://random-blog.net/y", "source": "Blog"},  # fora da lista
    ]
    accepted, rejected = validate_stories({"stories": [story(corro=corro)]}, CFG, known=set())
    assert accepted == [] and "1 fonte" in rejected[0]


def test_known_and_repeated_urls_are_skipped():
    accepted, rejected = validate_stories({"stories": [story(), story()]}, CFG, known=set())
    assert len(accepted) == 1 and "já conhecida" in rejected[0]
    accepted, _ = validate_stories({"stories": [story()]}, CFG, known={"https://www.espn.com/a"})
    assert accepted == []


def test_garbage_output_is_rejected_not_raised():
    assert validate_stories("texto", CFG, set())[0] == []
    assert validate_stories({"stories": "x"}, CFG, set())[0] == []


def test_parse_usage_bills_cache_reads_at_cache_price_never_as_output():
    # proporções de uma execução real (v0.21.5): muito mais cache do que entrada nova
    usage = {
        "input_tokens": 100_000, "cache_read_tokens": 500_000, "output_tokens": 2_000, "total_tokens": 602_000,
        "estimated_cost_usd": 0.12,
        "auxiliary": {"input_tokens": 0, "output_tokens": 0, "estimated_cost_usd": 0.0},
        "total_including_auxiliary": {"estimated_cost_usd": 0.12, "total_tokens": 602_000, "api_calls": 20},
    }
    assert parse_usage(usage, {}) == (600_000, 2_000, 0.12)
    prices = {"input_usd_per_mtok": 0.75, "output_usd_per_mtok": 3.75}
    # 100k × 0,75 + 500k × 0,075 (10% por omissão) + 2k × 3,75
    assert parse_usage(usage, prices) == (600_000, 2_000, 0.12)
    assert parse_usage(usage, {**prices, "cache_read_usd_per_mtok": 0.0})[2] == 0.0825
    assert parse_usage(None, {}) == (0, 0, 0.0)


def test_parse_usage_without_auxiliary_block():
    usage = {"input_tokens": 1000, "output_tokens": 200, "total_tokens": 1200, "estimated_cost_usd": 0.01}
    assert parse_usage(usage, {}) == (1000, 200, 0.01)


def test_config_disables_memory_and_picks_web_backend():
    y = build_config_yaml({"web_backend": "keyless", "max_turns": 30})
    assert "memory_enabled: false" in y and "keyless_fallback: true" in y and "backend" not in y and "max_turns: 30" in y
    assert "search_backend: brave-free" in build_config_yaml({"web_backend": "brave-free"})
    assert "  backend: tavily" in build_config_yaml({"web_backend": "tavily"})
