# Hermes Agent (Nous Research) + executor mínimo para o apps/api (runner.py).
# Versão fixada de propósito: o Hermes reescreve-se depressa e o comportamento
# do `hermes -z` / `--usage-file` é o contrato de que o apps/api depende.
FROM nousresearch/hermes-agent:0.21.5

COPY runner.py /runner/runner.py

# sem porta publicada no docker-compose — só a API lhe chega, pela rede interna
EXPOSE 8700

ENTRYPOINT []
CMD ["python3", "/runner/runner.py"]
