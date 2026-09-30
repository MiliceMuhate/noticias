# Hermes Agent (Nous Research) + executor mínimo para o apps/api (runner.py).
# Versão fixada de propósito: o Hermes reescreve-se depressa e o comportamento
# do `hermes -z` / `--usage-file` é o contrato de que o apps/api depende.
# As tags da imagem usam a data da versão: v2026.9.24 = Hermes 0.21.5
# (não existe tag "0.21.5" — ver hub.docker.com/r/nousresearch/hermes-agent/tags).
FROM nousresearch/hermes-agent:v2026.9.24

COPY runner.py /runner/runner.py

# Sem o /init (s6) da imagem: não precisamos do gateway nem do bootstrap dela,
# só do binário. O `hermes` no PATH é um shim que troca para o utilizador
# hermes via s6-setuidgid; chamamos o binário real diretamente, já como hermes
# (uid 10000, criado pela imagem) — assim o HERMES_HOME temporário de cada
# execução pertence ao mesmo utilizador que corre o agente.
ENV HERMES_BIN=/opt/hermes/.venv/bin/hermes
USER hermes

# sem porta publicada no docker-compose — só a API lhe chega, pela rede interna
EXPOSE 8700

ENTRYPOINT []
CMD ["python3", "/runner/runner.py"]
