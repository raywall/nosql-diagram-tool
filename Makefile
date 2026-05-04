.PHONY: start stop

PORT ?= 5177

# Inicia a ferramenta de modelagem NoSQL/DynamoDB
start:
	@echo ""
	@echo "  Iniciando NoSQL Diagram Tool em http://localhost:$(PORT)"
	@echo ""
	@python3 -m http.server $(PORT) --directory .

# Encerra qualquer processo na porta utilizada
stop:
	@echo "  Encerrando processos na porta $(PORT)..."
	@-lsof -ti tcp:$(PORT) | xargs kill 2>/dev/null || true
